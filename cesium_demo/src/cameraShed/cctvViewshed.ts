import { Cesium, viewer, ALT_2ND, ALT_3RD } from "../viewer";
import { CLOSED_ROOMS_BY_FLOOR } from "../config";
import { geoJsonUrl } from "../rooms";
import { models, type CameraModel } from "../models";

export type CctvCoverageStats = {
  coveragePercent: number;
  blindPercent: number;
  overlapPercent: number;
};

// constants requested
export const CCTV_MAX_RANGE_METERS = 25;
export const CCTV_SAMPLE_SPACING_METERS = 1.2;
export const CCTV_DEBUG_SAMPLE_POINTS = false;
export const SHOW_BLIND_SPOTS_BY_DEFAULT = false;

export const VIEWSHED_Z_OFFSET_METERS = 0.18;

// Occlusion is now determined by real 3D raycasting against the actual
// rendered building model (walls, furniture, everything) via
// scene.pickFromRay — this is literally "what would the camera lens see"
// rather than a flat 2D wall-polygon approximation. Each ray costs a full
// offscreen render pass, so:
//  - CCTV_SAMPLE_SPACING_METERS is coarser than the old 2D-only pass (was
//    0.75m) to keep total ray count reasonable.
//  - CCTV_3D_TARGET_HEIGHT_METERS picks a representative "person" height
//    above the floor to aim rays at, since a sample point isn't otherwise a
//    real object a ray could land on.
//  - Work is chunked with CCTV_3D_RAYS_PER_TICK, yielding to the browser
//    between batches so the tab stays responsive during an analysis run.
export const CCTV_3D_TARGET_HEIGHT_METERS = 1.2;
export const CCTV_3D_RAYS_PER_TICK = 24;
export const CCTV_3D_EYE_NUDGE_METERS = 0.05;
export const CCTV_3D_HIT_TOLERANCE_METERS = 0.15;

// When true, PTZ cameras without explicit headingMin/headingMax are
// treated as having full 360° pan capability for coverage purposes.
export const DEFAULT_PTZ_FULL_PAN_DEGREES = true;
export const CLOSED_ROOMS_ARE_BLIND_SPOTS = true;

type LonLat = { lon: number; lat: number };
type ClosedRoom = { name?: string; normalizedName: string; ring: LonLat[]; cameraName?: string };

const CLOSED_ROOM_CAMERA_TO_ROOM: Record<string, string> = {
  "pantry cam": "pantry",
  "stairs cam": "stairs",
  "conference room cam": "conference room",
  "meeting room cam": "meeting room",
};

type CameraCoverageMask = { cameraName: string; polygon: LonLat[] };

const APPROX_CAMERA_COVERAGE_MASKS: CameraCoverageMask[] = [
  {
    cameraName: "employee area cam 1",
    polygon: [
      { lon: 77.133596, lat: 28.670932 },
      { lon: 77.133626, lat: 28.670965 },
      { lon: 77.133668, lat: 28.670982 },
      { lon: 77.133727, lat: 28.670966 },
      { lon: 77.133752, lat: 28.670946 },
      { lon: 77.133733, lat: 28.670918 },
      { lon: 77.133681, lat: 28.670892 },
      { lon: 77.133626, lat: 28.670904 },
    ],
  },
];

function normalizeRoomName(name?: string): string {
  return (name ?? "").toLowerCase().trim();
}

function isClosedRoomName(name: string | undefined, floor: number): boolean {
  const normalized = normalizeRoomName(name);
  const configuredClosedRooms = CLOSED_ROOMS_BY_FLOOR[floor]?.map(normalizeRoomName) ?? [];
  return (
    configuredClosedRooms.includes(normalized) ||
    normalized.includes("washroom") ||
    normalized.includes("restroom") ||
    normalized.includes("toilet") ||
    normalized.includes("bathroom") ||
    normalized === "wc"
  );
}

function getCameraRoomConstraintIndex(camera: CameraModel, closedRooms: ClosedRoom[]): number {
  const mappedRoom = CLOSED_ROOM_CAMERA_TO_ROOM[normalizeRoomName(camera.cameraName)];
  if (mappedRoom) {
    return closedRooms.findIndex((room) => room.normalizedName === mappedRoom);
  }

  const camCfg = camera.cameraConfig;
  return closedRooms.findIndex((room) =>
    pointInPolygon(
      { x: camCfg.lon, y: camCfg.lat },
      room.ring.map((p) => ({ x: p.lon, y: p.lat }))
    )
  );
}

function getCameraCoverageMask(camera: CameraModel): CameraCoverageMask | undefined {
  const cameraName = normalizeRoomName(camera.cameraName);
  return APPROX_CAMERA_COVERAGE_MASKS.find((mask) => mask.cameraName === cameraName);
}

async function loadFloorPolygonsWithClosedRooms(floor: number): Promise<{ rings: LonLat[][]; closedRooms: ClosedRoom[]; }> {
  const rings: LonLat[][] = [];
  const closedRooms: ClosedRoom[] = [];

  let file = "";
  if (floor === 3) file = "2nd_floor_room1.geojson";
  else if (floor === 4) file = "3rd_floor_room1.geojson";
  else return { rings, closedRooms };

  const url = geoJsonUrl(file);
  const ds = await Cesium.GeoJsonDataSource.load(url as any);
  for (const ent of ds.entities.values) {
    if (!ent.polygon) continue;
    const h = ent.polygon.hierarchy?.getValue(Cesium.JulianDate.now());
    const positions: Cesium.Cartesian3[] = (h?.positions ?? []) as Cesium.Cartesian3[];
    if (!positions || positions.length === 0) continue;
    const ring = positions.map(cartesianToLonLat);
    // try to read properties: feature properties are available via ent.properties
    let roomName: string | undefined;
    try {
      const props = (ent.properties && (ent.properties as any).getValue) ? (ent.properties as any).getValue(Cesium.JulianDate.now()) : undefined;
      roomName = props?.room_name ?? props?.name ?? props?.roomName;
    } catch (e) {
      // ignore
    }
    if (isClosedRoomName(roomName, floor)) {
      const normalizedName = normalizeRoomName(roomName);
      const cameraName = Object.entries(CLOSED_ROOM_CAMERA_TO_ROOM)
        .find(([, mappedRoom]) => mappedRoom === normalizedName)?.[0];
      closedRooms.push({ name: roomName, normalizedName, ring, cameraName });
    }
    rings.push(ring);
  }

  if (closedRooms.length > 0) console.log("[CCTV Closed Rooms]", closedRooms.map(r => r.name));
  return { rings, closedRooms };
}

function getViewshedAltitude(floor: number): number {
  if (floor === 3) return ALT_2ND + VIEWSHED_Z_OFFSET_METERS;
  if (floor === 4) return ALT_3RD + VIEWSHED_Z_OFFSET_METERS;
  return VIEWSHED_Z_OFFSET_METERS;
}

const createdEntities: Cesium.Entity[] = [];

function clearEntities(): void {
  for (const e of createdEntities) viewer.entities.remove(e);
  createdEntities.length = 0;
  viewer.scene.requestRender();
}

export function clearCctvViewshed(): void {
  clearEntities();
}

function cartesianToLonLat(c: Cesium.Cartesian3): { lon: number; lat: number } {
  const carto = Cesium.Cartographic.fromCartesian(c);
  return { lon: Cesium.Math.toDegrees(carto.longitude), lat: Cesium.Math.toDegrees(carto.latitude) };
}

function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi + Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function metersPerDegree(latDeg: number): { mPerDegLat: number; mPerDegLon: number } {
  const latRad = latDeg * Math.PI / 180;
  const mPerDegLat = 111132.92 - 559.82 * Math.cos(2 * latRad) + 1.175 * Math.cos(4 * latRad);
  const mPerDegLon = 111412.84 * Math.cos(latRad) - 93.5 * Math.cos(3 * latRad);
  return { mPerDegLat, mPerDegLon };
}

function getFloorBaseAltitude(floor: number): number {
  if (floor === 3) return ALT_2ND;
  if (floor === 4) return ALT_3RD;
  return 0;
}

function addCellPolygon(lon: number, lat: number, halfLon: number, halfLat: number, color: Cesium.Color, floor: number): Cesium.Entity {
  const overlayAltitude = getViewshedAltitude(floor);
  const westLon = lon - halfLon;
  const eastLon = lon + halfLon;
  const southLat = lat - halfLat;
  const northLat = lat + halfLat;
  const positions = [
    Cesium.Cartesian3.fromDegrees(westLon, southLat, overlayAltitude),
    Cesium.Cartesian3.fromDegrees(eastLon, southLat, overlayAltitude),
    Cesium.Cartesian3.fromDegrees(eastLon, northLat, overlayAltitude),
    Cesium.Cartesian3.fromDegrees(westLon, northLat, overlayAltitude)
  ];
  const e = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(positions),
      material: color,
      outline: false,
      height: overlayAltitude,
      perPositionHeight: true,
      classificationType: undefined
    }
  });
  createdEntities.push(e);
  return e;
}

function addDebugPoint(lon: number, lat: number, color: Cesium.Color, floor: number): Cesium.Entity | null {
  if (!CCTV_DEBUG_SAMPLE_POINTS) return null;
  const overlayAltitude = getViewshedAltitude(floor);
  const e = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(lon, lat, overlayAltitude + 0.12),
    point: {
      pixelSize: 4,
      color,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY
    }
  });
  createdEntities.push(e);
  return e;
}

function isBearingWithinPan(cameraCfg: any, bearingDeg: number): boolean {
  const sector = getPtzCoverageSector(cameraCfg);
  return isAngleInsidePtzSector(bearingDeg, sector);
}

function normalizeAngle(angle: number): number {
  let a = angle % 360;
  if (a < 0) a += 360;
  return a;
}

function getPtzCoverageSector(config: any): { fullCircle: boolean; startDeg: number; endDeg: number } {
  const fov = config.fovDeg ?? 100;

  if (typeof config.headingMin === "number" && typeof config.headingMax === "number") {
    return {
      fullCircle: false,
      startDeg: normalizeAngle(config.headingMin - fov / 2),
      endDeg: normalizeAngle(config.headingMax + fov / 2),
    };
  }

  if (DEFAULT_PTZ_FULL_PAN_DEGREES) {
    return { fullCircle: true, startDeg: 0, endDeg: 360 };
  }

  return {
    fullCircle: false,
    startDeg: normalizeAngle((config.heading ?? 0) - fov / 2),
    endDeg: normalizeAngle((config.heading ?? 0) + fov / 2),
  };
}

function isAngleInsidePtzSector(angleDeg: number, sector: { fullCircle: boolean; startDeg: number; endDeg: number }): boolean {
  if (sector.fullCircle) return true;
  const angle = normalizeAngle(angleDeg);
  const start = normalizeAngle(sector.startDeg);
  const end = normalizeAngle(sector.endDeg);

  if (start <= end) return angle >= start && angle <= end;
  return angle >= start || angle <= end;
}

/** Cheap prefilter: is this sample within the camera's range and PTZ pan sector at all? Run before the expensive 3D raycast to avoid paying for pairs that can't possibly be visible. */
function isCandidateForCamera(cameraCfg: any, sample: { lon: number; lat: number }): boolean {
  const { mPerDegLat, mPerDegLon } = metersPerDegree(cameraCfg.lat);
  const dx = (sample.lon - cameraCfg.lon) * mPerDegLon;
  const dy = (sample.lat - cameraCfg.lat) * mPerDegLat;
  const horizDist = Math.sqrt(dx * dx + dy * dy);
  const range = (cameraCfg.maxRangeMeters ?? CCTV_MAX_RANGE_METERS);
  if (horizDist > range) return false;

  const angleToPointDeg = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; // same convention as heading
  return isBearingWithinPan(cameraCfg, angleToPointDeg);
}

const scratchRayDirection = new Cesium.Cartesian3();
const scratchRayOrigin = new Cesium.Cartesian3();
const scratchNudgeOffset = new Cesium.Cartesian3();

/**
 * True visibility check: casts a real ray from the camera's eye to the
 * target point and asks the scene what it actually hits first — the real
 * rendered building model (walls, furniture, doors, everything), not an
 * approximation. If the first thing the ray hits is at or beyond the
 * target's own distance, the target is visible; if something nearer blocks
 * it, the target is occluded.
 */
function isVisibleByRaycast3D(origin: Cesium.Cartesian3, target: Cesium.Cartesian3, objectsToExclude: any[]): boolean {
  const direction = Cesium.Cartesian3.subtract(target, origin, scratchRayDirection);
  const targetDistance = Cesium.Cartesian3.magnitude(direction);
  if (targetDistance < 1e-6) return true;
  Cesium.Cartesian3.normalize(direction, direction);

  // Nudge the ray's start forward slightly so it doesn't immediately
  // self-intersect the camera's own housing mesh at distance ~0.
  const nudge = Cesium.Cartesian3.multiplyByScalar(direction, CCTV_3D_EYE_NUDGE_METERS, scratchNudgeOffset);
  const nudgedOrigin = Cesium.Cartesian3.add(origin, nudge, scratchRayOrigin);

  const ray = new Cesium.Ray(nudgedOrigin, direction);
  let result: { position?: Cesium.Cartesian3 } | undefined;
  try {
    result = (viewer.scene as any).pickFromRay(ray, objectsToExclude);
  } catch {
    return true;
  }
  if (!result || !result.position) return true; // nothing in the way at all

  const hitDistance = Cesium.Cartesian3.distance(nudgedOrigin, result.position);
  return hitDistance >= targetDistance - CCTV_3D_HIT_TOLERANCE_METERS;
}

export type CoverageMode = "coverageOnly" | "blindOnly" | "coverageAndBlind" | "fansOnly";

async function computeCoverageGrid(cameras: CameraModel[], floor: number) {
  if (!cameras || cameras.length === 0) return null;
  const loaded = await loadFloorPolygonsWithClosedRooms(floor);
  const rings = loaded.rings;
  const closedRooms = loaded.closedRooms;
  if (rings.length === 0) return null;

  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const ring of rings) for (const p of ring) { minLon = Math.min(minLon, p.lon); minLat = Math.min(minLat, p.lat); maxLon = Math.max(maxLon, p.lon); maxLat = Math.max(maxLat, p.lat); }

  const centerLat = (minLat + maxLat) / 2;
  const { mPerDegLat, mPerDegLon } = metersPerDegree(centerLat);
  const stepLon = CCTV_SAMPLE_SPACING_METERS / mPerDegLon;
  const stepLat = CCTV_SAMPLE_SPACING_METERS / mPerDegLat;

  const samples: { lon: number; lat: number }[] = [];
  for (let lon = minLon; lon <= maxLon; lon += stepLon) {
    for (let lat = minLat; lat <= maxLat; lat += stepLat) {
      const inside = rings.some((ring) => pointInPolygon({ x: lon, y: lat }, ring.map((r) => ({ x: r.lon, y: r.lat }))));
      if (inside) samples.push({ lon, lat });
    }
  }

  if (samples.length === 0) return null;

  // no separate fan-only export; keep raycasting internal for coverage

  const seenCounts: number[] = new Array(samples.length).fill(0);

  // Precompute which samples are inside closed rooms (index into closedRooms or -1)
  const sampleClosedRoomIndex: number[] = new Array(samples.length).fill(-1);
  if (closedRooms && closedRooms.length > 0) {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      for (let r = 0; r < closedRooms.length; r++) {
        const ring = closedRooms[r].ring;
        if (pointInPolygon({ x: s.lon, y: s.lat }, ring.map((p) => ({ x: p.lon, y: p.lat })))) {
          sampleClosedRoomIndex[i] = r;
          break;
        }
      }
    }
  }

  // Precompute camera closed-room membership. Named room cameras are intentionally
  // constrained to their assigned room even if their point sits on a shared wall.
  const cameraClosedRoomIndex: number[] = new Array(cameras.length).fill(-1);
  const cameraCoverageMasks = cameras.map(getCameraCoverageMask);
  if (closedRooms && closedRooms.length > 0) {
    for (let ci = 0; ci < cameras.length; ci++) {
      cameraClosedRoomIndex[ci] = getCameraRoomConstraintIndex(cameras[ci], closedRooms);
    }
  }

    // Debug: log PTZ sector for each camera
    for (const cam of cameras) {
      try {
        const cfg = cam.cameraConfig;
        const sector = getPtzCoverageSector(cfg);
        console.log("[PTZ Viewshed]", cam.cameraName, {
          lon: cfg.lon,
          lat: cfg.lat,
          heading: cfg.heading,
          headingMin: cfg.headingMin,
          headingMax: cfg.headingMax,
          fovDeg: cfg.fovDeg,
          sector,
          maxRange: cfg.maxRangeMeters ?? CCTV_MAX_RANGE_METERS,
        });
      } catch (e) {
        console.warn("[PTZ Viewshed] invalid camera config", cam && (cam as any).cameraName, e);
      }
    }

    const targetAltitude = getFloorBaseAltitude(floor) + CCTV_3D_TARGET_HEIGHT_METERS;
    const cameraOrigins = cameras.map((cam) =>
      Cesium.Cartesian3.fromDegrees(cam.cameraConfig.lon, cam.cameraConfig.lat, cam.cameraConfig.height)
    );
    // Real ray-picking should never treat a camera's own housing mesh as an obstruction.
    const objectsToExclude = models.cameras.filter((c): c is CameraModel => Boolean(c));

    // Cheap prefilter first (range + PTZ pan sector + room constraints) — only
    // pairs that survive this get the expensive 3D raycast, since each ray is
    // a full offscreen render pass against the real building model.
    type Candidate = { sampleIndex: number; cameraIndex: number; target: Cesium.Cartesian3 };
    const candidates: Candidate[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const sampleRoom = sampleClosedRoomIndex[i];
      for (let ci = 0; ci < cameras.length; ci++) {
        const cam = cameras[ci];
        const cameraRoom = cameraClosedRoomIndex[ci];

        // Closed-room cameras only count samples inside their assigned room.
        if (cameraRoom >= 0 && sampleRoom !== cameraRoom) continue;

        // Closed-room samples cannot be claimed by corridor/employee/library cameras.
        if (sampleRoom >= 0 && cameraRoom !== sampleRoom) continue;

        const coverageMask = cameraCoverageMasks[ci];
        if (coverageMask && !pointInPolygon({ x: s.lon, y: s.lat }, coverageMask.polygon.map((p) => ({ x: p.lon, y: p.lat })))) {
          continue;
        }

        if (!isCandidateForCamera(cam.cameraConfig, s)) continue;

        candidates.push({
          sampleIndex: i,
          cameraIndex: ci,
          target: Cesium.Cartesian3.fromDegrees(s.lon, s.lat, targetAltitude),
        });
      }
    }

    // Expensive pass: real 3D visibility via scene raycasting against the
    // actual rendered model, chunked so the tab stays responsive.
    for (let k = 0; k < candidates.length; k++) {
      const { sampleIndex, cameraIndex, target } = candidates[k];
      if (isVisibleByRaycast3D(cameraOrigins[cameraIndex], target, objectsToExclude)) {
        seenCounts[sampleIndex]++;
      }
      if (k % CCTV_3D_RAYS_PER_TICK === CCTV_3D_RAYS_PER_TICK - 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }

  let covered = 0;
  let overlap = 0;
  for (let i = 0; i < samples.length; i++) {
    const count = seenCounts[i];
    if (count >= 1) covered++;
    if (count > 1) overlap++;
  }

  const coveragePercent = Math.round((covered / samples.length) * 10000) / 100;
  const blindPercent = Math.round(((samples.length - covered) / samples.length) * 10000) / 100;
  const overlapPercent = Math.round((overlap / samples.length) * 10000) / 100;

  return { rings, samples, seenCounts, stepLon, stepLat, coveragePercent, blindPercent, overlapPercent };
}

function renderGridCells(samples: { lon: number; lat: number }[], seenCounts: number[], stepLon: number, stepLat: number, floor: number, mode: CoverageMode) {
  const halfLon = stepLon / 2;
  const halfLat = stepLat / 2;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const count = seenCounts[i];
    if (count < 0) continue; // skipped cell (e.g., closed room and configured to skip)
    if (mode === "coverageOnly") {
      if (count >= 1) {
        const color = count === 1 ? Cesium.Color.GREEN.withAlpha(0.22) : Cesium.Color.CYAN.withAlpha(0.30);
        addCellPolygon(s.lon, s.lat, halfLon, halfLat, color, floor);
      }
    } else if (mode === "blindOnly") {
      if (count === 0) addCellPolygon(s.lon, s.lat, halfLon, halfLat, Cesium.Color.RED.withAlpha(0.28), floor);
    } else if (mode === "coverageAndBlind") {
      if (count === 0) addCellPolygon(s.lon, s.lat, halfLon, halfLat, Cesium.Color.RED.withAlpha(0.28), floor);
      else {
        const color = count === 1 ? Cesium.Color.GREEN.withAlpha(0.22) : Cesium.Color.CYAN.withAlpha(0.30);
        addCellPolygon(s.lon, s.lat, halfLon, halfLat, color, floor);
      }
    }
    // debug sample points
    if (CCTV_DEBUG_SAMPLE_POINTS) {
      if (count === 0) addDebugPoint(s.lon, s.lat, Cesium.Color.RED, floor);
      else if (count === 1) addDebugPoint(s.lon, s.lat, Cesium.Color.GREEN, floor);
      else addDebugPoint(s.lon, s.lat, Cesium.Color.CYAN, floor);
    }
  }
}

/**
 * Renders a coverage/blind-spot overlay for the given camera(s) — pass a
 * single camera for a per-camera-window view, or a floor's whole camera
 * list for a floor-wide view. `mode` picks what's drawn: coverage cells
 * only, blind cells only, or both together.
 */
export async function showCoverage(
  cameras: CameraModel[],
  floor: number,
  mode: "coverageOnly" | "blindOnly" | "coverageAndBlind"
): Promise<CctvCoverageStats> {
  clearEntities();
  const data = await computeCoverageGrid(cameras, floor);
  if (!data) return { coveragePercent: 0, blindPercent: 100, overlapPercent: 0 };
  renderGridCells(data.samples, data.seenCounts, data.stepLon, data.stepLat, floor, mode);
  viewer.scene.requestRender();
  return { coveragePercent: data.coveragePercent, blindPercent: data.blindPercent, overlapPercent: data.overlapPercent };
}
