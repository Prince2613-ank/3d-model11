import { Cesium, viewer, ALT_2ND, ALT_3RD } from "./viewer";
import { BUILDING_ENTRANCE, lookupRoomPOI, ROOM_POIS, type RoomPOI } from "./buildingPOI";
import { ChairModel, getPickedChair, highlightChair } from "./chairs";
import {
  CameraModel,
  getPickedCamera,
  enterCctvMode,
  exitCctvMode,
  setCctvHeading,
  setCctvPitch,
  isCctvActive,
  getCameraByName,
  ensureFloorModelLoaded,
  resetCctvDefaultView,
  getCctvDebugInfo,
  models,
} from "./models";
import { GlobalEvent, matchRoomName, showToast, cancelBooking, currentUserEmail } from "./booking";
import { BOOKABLE_ROOMS } from "./rooms";
import { FLOOR_CAMERAS } from "./config";
import {
  clearCctvViewshed,
  showBlindSpots,
  showCameraViewshed,
  showCoverageAndBlindSpots,
  showCoverageOnly,
  type CctvCoverageStats,
} from "./cameraShed/cctvViewshed";

export type NavigationStep = {
  icon: string;
  title: string;
  primary?: string;
  text?: string;
};

export type NavigationSummary = {
  fromName: string;
  toName: string;
  totalDistance: number;
  totalTime: number;
  list: NavigationStep[];
};

export type NavigationHudState = {
  icon: "forward" | "left" | "right" | "stairs" | "arrive";
  instruction: string;
  context: string;
  distanceMeters: number;
};

type UiCallbacks = {
  showFloor: (floor: number) => void | Promise<void>;
  preloadFloor?: (floor: number) => void | Promise<void>;
  startNavigation: () => void | Promise<void>;
  exitNavigation: () => void;
};

type SceneCallbacks = {
  onRoomClick?: (roomName: string) => void;
};

let lastHoveredChair: ChairModel | null = null;

function optionalElement<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function setText(id: string, value: string): void {
  const node = optionalElement<HTMLElement>(id);
  if (node) node.innerText = value;
}

type MapCoordinate = { lon: number; lat: number };
type MapSearchCandidate = MapCoordinate & {
  label: string;
  kind?: string;
  importance?: number;
};
const BUILDING_ROOM_MAP_COORDINATE: MapCoordinate = { lat: 28.67094925880298, lon: 77.13370522156849 };

const KNOWN_MAP_PLACES: Record<string, MapCoordinate> = {
  manthan: BUILDING_ROOM_MAP_COORDINATE,
  "flodata": BUILDING_ROOM_MAP_COORDINATE,
  "flodata analytics": BUILDING_ROOM_MAP_COORDINATE,
  "punjabi bagh west metro": { lat: 28.6730178, lon: 77.1373636 },
  "punjabi bagh west metro station": { lat: 28.6730178, lon: 77.1373636 },
  "punjabi bagh west": { lat: 28.6730178, lon: 77.1373636 },
  "shadipur": { lat: 28.6518, lon: 77.1482 },
  "shadipur metro": { lat: 28.6518, lon: 77.1482 },
  "shadipur metro station": { lat: 28.6518, lon: 77.1482 },
  "shadipur metro station new delhi": { lat: 28.6518, lon: 77.1482 },
  "shadipur metro station, new delhi": { lat: 28.6518, lon: 77.1482 },
};

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/\s+\((2nd|3rd) floor\)$/i, "").trim();
}

function findBuildingRoomMapCoordinate(value: string): MapCoordinate | null {
  const normalized = normalizeLabel(normalizeMapSearchText(value));
  if (!normalized) return null;

  const selects = [
    optionalElement<HTMLSelectElement>("fromRoom"),
    optionalElement<HTMLSelectElement>("toRoom"),
  ].filter((select): select is HTMLSelectElement => Boolean(select));

  for (const select of selects) {
    const match = Array.from(select.options).some((option) => {
      const optionLabel = normalizeMapSearchText(option.value);
      return normalizeLabel(optionLabel) === normalized;
    });
    if (match) return BUILDING_ROOM_MAP_COORDINATE;
  }

  return null;
}

function selectIndoorRoom(selectId: string, preferredRoom: string, preferredFloorLabel?: string): boolean {
  const select = optionalElement<HTMLSelectElement>(selectId);
  if (!select) return false;

  const normalized = normalizeLabel(preferredRoom);
  const options = Array.from(select.options);
  const exact = options.find((option) => {
    const label = option.value.toLowerCase();
    return normalizeLabel(option.value) === normalized && (!preferredFloorLabel || label.includes(preferredFloorLabel.toLowerCase()));
  }) ?? options.find((option) => normalizeLabel(option.value) === normalized);

  if (!exact) return false;
  select.value = exact.value;
  return true;
}

function syncIndoorRouteFromMap(destination: string): void {
  const destinationName = destination.trim() || "Manthan";
  const matchedDestination = selectIndoorRoom("toRoom", destinationName);
  const matchedEntrance = selectIndoorRoom("fromRoom", "Entrance", "2nd");

  if (matchedDestination && matchedEntrance) {
    setText("fromNameDisplay", element<HTMLSelectElement>("fromRoom").value);
    setText("toNameDisplay", element<HTMLSelectElement>("toRoom").value);
    setNavigationMessage("Outdoor route ready. Start indoor navigation from Entrance when you arrive.", false);
  }
}

function parseCoordinateInput(value: string): MapCoordinate | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { lat: first, lon: second };
  }
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { lon: first, lat: second };
  }
  return null;
}

async function resolveMapPlace(value: string): Promise<MapCoordinate | null> {
  const input = value.trim();
  const normalized = normalizeMapSearchText(input);
  if (!input) return null;

  const coordinate = parseCoordinateInput(input);
  if (coordinate) return coordinate;

  const known = KNOWN_MAP_PLACES[normalized];
  if (known) return known;

  const buildingRoom = findBuildingRoomMapCoordinate(input);
  if (buildingRoom) return buildingRoom;

  const queryAttempts = buildMapSearchQueries(input);
  for (const query of queryAttempts) {
    const result = await geocodeWithNominatim(query);
    if (result) return result;
  }

  for (const query of queryAttempts) {
    const result = await geocodeWithPhoton(query);
    if (result) return result;
  }

  return null;
}

function normalizeMapSearchText(value: string): string {
  return value.toLowerCase().replace(/[,\s]+/g, " ").trim();
}

function buildMapSearchQueries(input: string): string[] {
  const cleaned = input.trim();
  const normalized = normalizeMapSearchText(cleaned);
  const queries = [cleaned];

  // Keep Indian metro searches strong, but do not restrict global searches.
  if (normalized.includes("metro") && !normalized.includes("india")) {
    queries.push(`${cleaned}, India`);
  }

  if (normalized.includes("metro") && !normalized.includes("delhi metro")) {
    queries.push(`${cleaned}, Delhi Metro`);
  }

  return Array.from(new Set(queries));
}

function readCoordinateResult(result: { lat: string | number; lon: string | number }): Pick<MapSearchCandidate, "lat" | "lon"> | null {
  const lat = Number(result.lat);
  const lon = Number(result.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function scoreMapCandidate(query: string, candidate: MapSearchCandidate): number {
  const queryTokens = normalizeMapSearchText(query).split(" ").filter(Boolean);
  const label = normalizeMapSearchText(candidate.label);
  const kind = normalizeMapSearchText(candidate.kind ?? "");
  let score = candidate.importance ?? 0;

  for (const token of queryTokens) {
    if (label.includes(token)) score += 2.5;
    if (kind.includes(token)) score += 1.25;
  }

  if (label.startsWith(normalizeMapSearchText(query))) score += 4;
  if (queryTokens.includes("metro") && /station|subway|railway|halt|stop/.test(`${label} ${kind}`)) score += 5;
  if (queryTokens.includes("airport") && /airport|aerodrome/.test(`${label} ${kind}`)) score += 5;
  return score;
}

function bestMapCandidate(query: string, candidates: MapSearchCandidate[]): MapCoordinate | null {
  if (candidates.length === 0) return null;
  return candidates
    .map((candidate) => ({ candidate, score: scoreMapCandidate(query, candidate) }))
    .sort((a, b) => b.score - a.score)[0].candidate;
}

async function geocodeWithNominatim(query: string): Promise<MapCoordinate | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const results = await response.json() as Array<{
      lat: string;
      lon: string;
      display_name?: string;
      type?: string;
      class?: string;
      importance?: number;
    }>;
    const candidates: MapSearchCandidate[] = results
      .map((result) => {
        const coordinate = readCoordinateResult(result);
        if (!coordinate) return null;
        return {
          ...coordinate,
          label: result.display_name ?? "",
          kind: `${result.class ?? ""} ${result.type ?? ""}`,
          importance: result.importance,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    return bestMapCandidate(query, candidates);
  } catch (error) {
    console.warn("Map geocoder failed:", query, error);
    return null;
  }
}

async function geocodeWithPhoton(query: string): Promise<MapCoordinate | null> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = await response.json() as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; city?: string; country?: string; osm_value?: string; type?: string };
      }>;
    };
    const candidates: MapSearchCandidate[] = (data.features ?? [])
      .map((feature) => {
        const coordinates = feature.geometry?.coordinates;
        if (!coordinates) return null;
        const [lon, lat] = coordinates;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const properties = feature.properties;
        return {
          lat,
          lon,
          label: [properties?.name, properties?.city, properties?.country].filter(Boolean).join(", "),
          kind: `${properties?.osm_value ?? ""} ${properties?.type ?? ""}`,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
    return bestMapCandidate(query, candidates);
  } catch (error) {
    console.warn("Backup map geocoder failed:", query, error);
    return null;
  }
}

const LABEL_STYLE = Cesium.LabelStyle.FILL_AND_OUTLINE;

function clearMapRoute(): void {
  [
    "outdoorMapRouteRoadBand", "outdoorMapRouteGroundLine", "outdoorMapRouteLine",
    "outdoorMapRouteOverlayBand", "outdoorMapRouteStart", "outdoorMapRouteEnd",
    "outdoorMapRouteEntrance", "outdoorMapRouteIndoor", "outdoorMapRouteDestination",
    "outdoorMapRouteFloorSwitch",
  ].forEach((id) => viewer.entities.removeById(id));
}

function flyToBoundingSpherePromise(
  sphere: Cesium.BoundingSphere,
  options: Record<string, unknown>
): Promise<void> {
  return new Promise<void>((resolve) => {
    viewer.camera.flyToBoundingSphere(sphere, {
      ...options,
      complete: resolve as any,
      cancel: resolve as any,
    } as any);
  });
}

async function orchestrateCameraForRoute(
  routePositions: MapCoordinate[],
  roomPOI: RoomPOI | null
): Promise<void> {
  const points = routePositions.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 22));
  if (points.length === 0) return;

  const sphere = Cesium.BoundingSphere.fromPoints(points);
  await flyToBoundingSpherePromise(sphere, {
    duration: 1.2,
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(0),
      Cesium.Math.toRadians(-80),
      Math.max(sphere.radius * 2.65, 500)
    ),
  });

  if (!roomPOI) return;

  await new Promise<void>((resolve) => setTimeout(resolve, 900));

  await flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(
      BUILDING_ENTRANCE.lon, BUILDING_ENTRANCE.lat, 62
    ),
    orientation: {
      heading: Cesium.Math.toRadians(342),
      pitch: Cesium.Math.toRadians(-72),
      roll: 0,
    },
    duration: 1.5,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
}

function drawFullRoute(
  route: MapCoordinate[],
  start: MapCoordinate,
  entranceOrEnd: MapCoordinate,
  roomPOI: RoomPOI | null,
  destinationLabel: string
): void {
  clearMapRoute();

  const positions = route.length > 1 ? route : [start, entranceOrEnd];
  const outdoorPositions = positions.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 26.0));

  // ── Outdoor polyline ──────────────────────────────────────────────────────
  viewer.entities.add({
    id: "outdoorMapRouteLine",
    polyline: {
      positions: outdoorPositions,
      width: 24,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.22,
        taperPower: 0.5,
        color: Cesium.Color.fromCssColorString("#0B66FF").withAlpha(0.82),
      }),
      depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.30,
        taperPower: 0.5,
        color: Cesium.Color.fromCssColorString("#0B66FF").withAlpha(0.82),
      }),
      clampToGround: false,
    },
  });

  // ── Start marker ──────────────────────────────────────────────────────────
  viewer.entities.add({
    id: "outdoorMapRouteStart",
    position: Cesium.Cartesian3.fromDegrees(start.lon, start.lat, 6),
    point: {
      pixelSize: 16,
      color: Cesium.Color.fromCssColorString("#22c55e"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 4,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: "Start",
      font: "bold 13px sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#166534"),
      outlineWidth: 2,
      style: LABEL_STYLE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -14),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 0.9,
    },
  });

  if (roomPOI) {
    const floorAlt = roomPOI.floor === 3 ? ALT_2ND : ALT_3RD;
    const indoorAlt = floorAlt + 1.5;

    // ── Building Entrance marker ────────────────────────────────────────────
    viewer.entities.add({
      id: "outdoorMapRouteEntrance",
      position: Cesium.Cartesian3.fromDegrees(BUILDING_ENTRANCE.lon, BUILDING_ENTRANCE.lat, 10),
      point: {
        pixelSize: 20,
        color: Cesium.Color.fromCssColorString("#F59E0B"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: "Building Entrance",
        font: "bold 13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#92400E"),
        outlineWidth: 2,
        style: LABEL_STYLE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 0.9,
      },
    });

    // ── Floor switch label for 3rd floor destinations ───────────────────────
    if (roomPOI.floor === 4) {
      viewer.entities.add({
        id: "outdoorMapRouteFloorSwitch",
        position: Cesium.Cartesian3.fromDegrees(BUILDING_ENTRANCE.lon, BUILDING_ENTRANCE.lat, ALT_2ND + 3),
        label: {
          text: "⬆ Floor Switch: 2nd → 3rd",
          font: "12px sans-serif",
          fillColor: Cesium.Color.fromCssColorString("#FCD34D"),
          outlineColor: Cesium.Color.fromCssColorString("#78350F"),
          outlineWidth: 2,
          style: LABEL_STYLE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(22, -14),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 0.82,
        },
      });
    }

    // ── Indoor path indicator (entrance → room door) ────────────────────────
    viewer.entities.add({
      id: "outdoorMapRouteIndoor",
      polyline: {
        positions: [
          Cesium.Cartesian3.fromDegrees(BUILDING_ENTRANCE.lon, BUILDING_ENTRANCE.lat, indoorAlt),
          Cesium.Cartesian3.fromDegrees(roomPOI.doorLon, roomPOI.doorLat, indoorAlt),
        ],
        width: 12,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.5,
          color: Cesium.Color.fromCssColorString("#00CCFF").withAlpha(0.95),
        }),
        depthFailMaterial: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.5,
          color: Cesium.Color.fromCssColorString("#00CCFF").withAlpha(0.95),
        }),
      },
    });

    // ── Destination room marker ─────────────────────────────────────────────
    const approxNote = roomPOI.positionApproximate ? "\n(position approximate)" : "";
    viewer.entities.add({
      id: "outdoorMapRouteDestination",
      position: Cesium.Cartesian3.fromDegrees(roomPOI.doorLon, roomPOI.doorLat, indoorAlt + 1),
      point: {
        pixelSize: 22,
        color: Cesium.Color.fromCssColorString("#EF4444"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${destinationLabel}${approxNote}`,
        font: "bold 13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString("#991B1B"),
        outlineWidth: 2,
        style: LABEL_STYLE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 0.9,
      },
    });
  } else {
    // Pure outdoor destination — no room POI
    viewer.entities.add({
      id: "outdoorMapRouteEnd",
      position: Cesium.Cartesian3.fromDegrees(entranceOrEnd.lon, entranceOrEnd.lat, 6),
      point: {
        pixelSize: 18,
        color: Cesium.Color.fromCssColorString("#ef4444"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 4,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  viewer.scene.requestRender();
}

async function fetchOutdoorRoute(start: MapCoordinate, end: MapCoordinate): Promise<MapCoordinate[]> {
  const routeProfiles = ["driving", "walking"];

  for (const profile of routeProfiles) {
    const url = new URL(`https://router.project-osrm.org/route/v1/${profile}/${start.lon},${start.lat};${end.lon},${end.lat}`);
    url.searchParams.set("overview", "full");
    url.searchParams.set("geometries", "geojson");

    try {
      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const data = await response.json() as {
        routes?: Array<{ geometry?: { coordinates?: Array<[number, number]> } }>;
      };
      const coordinates = data.routes?.[0]?.geometry?.coordinates ?? [];
      if (coordinates.length > 1) {
        return coordinates.map(([lon, lat]) => ({ lon, lat }));
      }
    } catch (error) {
      console.warn("Outdoor route service failed:", profile, error);
    }
  }

  return [];
}

function createMapToolbarButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = "googleMapRouteBtn";
  button.className = "cesium-toolbar-button google-map-route-btn";
  button.type = "button";
  button.title = "Google Maps route";
  button.setAttribute("aria-label", "Google Maps route");
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M12 2.2a6.8 6.8 0 0 1 6.8 6.8c0 4.7-6.8 12.8-6.8 12.8S5.2 13.7 5.2 9A6.8 6.8 0 0 1 12 2.2z"/>
      <path fill="#34A853" d="M12 21.8s6.8-8.1 6.8-12.8c0-1.4-.4-2.8-1.2-3.9L8.3 18.7c1.8 2.1 3.7 3.1 3.7 3.1z"/>
      <path fill="#FBBC05" d="M5.2 9c0 2.2 1.5 5.1 3.1 7.3l9.3-11.2A6.8 6.8 0 0 0 5.2 9z"/>
      <path fill="#EA4335" d="M12 2.2A6.8 6.8 0 0 0 5.2 9c0 1.4.6 3.1 1.4 4.7l4.1-4.1A2.2 2.2 0 0 1 12 6.8c.7 0 1.3.3 1.7.7l3.9-2.4A6.8 6.8 0 0 0 12 2.2z"/>
      <circle cx="12" cy="9" r="2.3" fill="#fff"/>
    </svg>
  `;
  return button;
}

// ── Enter-Building prompt ─────────────────────────────────────────────────────
let enterBuildingFloorSwitchCallback: ((floor: number) => void | Promise<void>) | null = null;
let enterBuildingTargetFloor = 3;  // default: 2nd floor

export function setEnterBuildingFloorSwitchCallback(
  cb: ((floor: number) => void | Promise<void>) | null
): void {
  enterBuildingFloorSwitchCallback = cb;
}

function bindEnterBuildingPrompt(): void {
  const prompt = optionalElement<HTMLElement>("enterBuildingPrompt");
  const enterBtn = optionalElement<HTMLButtonElement>("enterBuildingBtn");
  const cancelBtn = optionalElement<HTMLButtonElement>("enterBuildingCancelBtn");
  if (!prompt || !enterBtn || !cancelBtn) return;

  cancelBtn.addEventListener("click", () => {
    prompt.hidden = true;
  });

  enterBtn.addEventListener("click", () => {
    prompt.hidden = true;
    optionalElement<HTMLElement>("mapDirectionsPanel")?.setAttribute("hidden", "");

    const targetFloor = enterBuildingTargetFloor;

    showFloorSpinner("Entering building…");
    void (async () => {
      try {
        // Switch to the correct floor
        await Promise.resolve(enterBuildingFloorSwitchCallback?.(targetFloor));

        // Fly camera to the indoor entrance position
        const floorAlt = targetFloor === 3 ? ALT_2ND : ALT_3RD;
        await flyToPromise({
          destination: Cesium.Cartesian3.fromDegrees(
            BUILDING_ENTRANCE.lon,
            BUILDING_ENTRANCE.lat,
            floorAlt + 7
          ),
          orientation: {
            heading: Cesium.Math.toRadians(342),
            pitch: Cesium.Math.toRadians(-60),
            roll: 0,
          },
          duration: 1.8,
          easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
        });

        // Trigger indoor navigation if rooms are pre-selected
        const fromSel = optionalElement<HTMLSelectElement>("fromRoom");
        const toSel = optionalElement<HTMLSelectElement>("toRoom");
        if (fromSel?.value && toSel?.value) {
          optionalElement<HTMLButtonElement>("startNavBtn")?.click();
        } else {
          setNavigationMessage("Inside the building. Select your room and start navigation.", false);
        }
      } finally {
        hideFloorSpinner();
      }
    })();
  });
}

export function showEnterBuildingPrompt(destinationLabel: string, destFloor: number): void {
  const prompt = optionalElement<HTMLElement>("enterBuildingPrompt");
  const destText = optionalElement<HTMLElement>("enterBuildingDestText");
  if (!prompt) return;

  enterBuildingTargetFloor = destFloor;

  if (destText) {
    destText.textContent = destinationLabel
      ? `Destination: ${destinationLabel}`
      : "Walk inside to reach your destination";
  }

  prompt.hidden = false;
}

function isKnownDropdownRoom(value: string): boolean {
  const normalized = normalizeLabel(value);
  const selects = [
    optionalElement<HTMLSelectElement>("fromRoom"),
    optionalElement<HTMLSelectElement>("toRoom"),
  ].filter((s): s is HTMLSelectElement => Boolean(s));
  return selects.some((select) =>
    Array.from(select.options).some((opt) => normalizeLabel(opt.value) === normalized)
  );
}

export function installMapDirectionsControl(): void {
  bindEnterBuildingPrompt();

  const toolbar = document.querySelector<HTMLElement>(".cesium-viewer-toolbar");
  const panel = optionalElement<HTMLElement>("mapDirectionsPanel");
  if (!toolbar || !panel || document.getElementById("googleMapRouteBtn")) return;

  const button = createMapToolbarButton();
  toolbar.prepend(button);

  const originInput = element<HTMLInputElement>("mapOriginInput");
  const destinationInput = element<HTMLInputElement>("mapDestinationInput");
  const closeButton = element<HTMLButtonElement>("mapDirectionsCloseBtn");
  const currentLocationButton = element<HTMLButtonElement>("useCurrentLocationBtn");
  const routeButton = element<HTMLButtonElement>("showGoogleRouteBtn");

  button.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) destinationInput.focus();
  });

  closeButton.addEventListener("click", () => {
    panel.hidden = true;
  });

  currentLocationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Current location is not available in this browser.", "error");
      return;
    }

    currentLocationButton.disabled = true;
    currentLocationButton.textContent = "Locating";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        originInput.value = `${position.coords.latitude.toFixed(7)},${position.coords.longitude.toFixed(7)}`;
        currentLocationButton.disabled = false;
        currentLocationButton.textContent = "Locate";
        syncIndoorRouteFromMap(destinationInput.value);
        showToast("Current location selected.", "success");
      },
      () => {
        currentLocationButton.disabled = false;
        currentLocationButton.textContent = "Locate";
        showToast("Allow location permission to use current location.", "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });

  const indoorNavBtn = optionalElement<HTMLButtonElement>("worldRouteIndoorNavBtn");
  const debugPOIBtn = optionalElement<HTMLButtonElement>("worldRouteDebugBtn");

  // ── Debug: toggle all room POI markers ───────────────────────────────────
  let debugPOIEntityIds: string[] = [];
  debugPOIBtn?.addEventListener("click", () => {
    if (debugPOIEntityIds.length > 0) {
      debugPOIEntityIds.forEach((id) => viewer.entities.removeById(id));
      debugPOIEntityIds = [];
      if (debugPOIBtn) debugPOIBtn.textContent = "Debug: Show Room POIs";
      viewer.scene.requestRender();
      return;
    }

    for (const poi of ROOM_POIS) {
      const floorAlt = poi.floor === 3 ? ALT_2ND : ALT_3RD;
      const id = `debugPOI_${poi.name}_${poi.floor}`;
      viewer.entities.add({
        id,
        position: Cesium.Cartesian3.fromDegrees(poi.doorLon, poi.doorLat, floorAlt + 1.2),
        point: {
          pixelSize: 11,
          color: poi.positionApproximate
            ? Cesium.Color.fromCssColorString("#FCD34D")
            : Cesium.Color.fromCssColorString("#00CCFF"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `${poi.name}\n${poi.floorLabel}${poi.positionApproximate ? "\n(~approx)" : ""}`,
          font: "11px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: LABEL_STYLE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scale: 0.82,
        },
      });
      debugPOIEntityIds.push(id);
    }

    if (debugPOIBtn) debugPOIBtn.textContent = "Debug: Hide Room POIs";
    viewer.scene.requestRender();
  });

  // ── Start Indoor Navigation ───────────────────────────────────────────────
  indoorNavBtn?.addEventListener("click", () => {
    panel.hidden = true;
    optionalElement<HTMLButtonElement>("startNavBtn")?.click();
  });

  // ── Show Route ────────────────────────────────────────────────────────────
  routeButton.addEventListener("click", () => {
    void (async () => {
      const origin = originInput.value.trim() || "Punjabi Bagh West Metro Station";
      const destination = destinationInput.value.trim() || "Manthan";

      const roomPOI = lookupRoomPOI(destination);
      syncIndoorRouteFromMap(destination);

      // Validation: known dropdown room but no POI coordinate configured
      if (!roomPOI && isKnownDropdownRoom(destination)) {
        showToast("Room location not configured. Contact admin to add door coordinates.", "error");
        return;
      }

      routeButton.disabled = true;
      routeButton.textContent = "Finding Route…";

      try {
        const start = await resolveMapPlace(origin);
        if (!start) {
          showToast("Start location not found. Try a full address or lat,lng.", "error");
          return;
        }

        // Outdoor route always ends at building entrance when destination is a room
        let outdoorEnd: MapCoordinate;
        if (roomPOI) {
          outdoorEnd = BUILDING_ENTRANCE;
        } else {
          const resolved = await resolveMapPlace(destination);
          if (!resolved) {
            showToast("Destination not found. Try a full address or lat,lng.", "error");
            return;
          }
          outdoorEnd = resolved;
        }

        const route = await fetchOutdoorRoute(start, outdoorEnd as MapCoordinate);
        drawFullRoute(route, start, outdoorEnd as MapCoordinate, roomPOI, destination);

        if (indoorNavBtn) indoorNavBtn.hidden = !roomPOI;

        if (roomPOI?.positionApproximate) {
          showToast(`Note: ${roomPOI.name} door position is approximate — verify on site.`, "error");
        }

        // Show "Enter Building" prompt after route is drawn
        if (roomPOI) {
          showEnterBuildingPrompt(destination, roomPOI.floor);
        }

        const routePositions = route.length > 1 ? route : [start, outdoorEnd as MapCoordinate];
        void orchestrateCameraForRoute(routePositions, roomPOI);

        setNavigationMessage(
          roomPOI
            ? `Outdoor route shown. Walk to Building Entrance, then tap Enter Building.`
            : "Outdoor route shown on map.",
          false
        );
      } catch (error) {
        console.error("Failed to show outdoor route:", error);
        showToast("Could not load outdoor route.", "error");
      } finally {
        routeButton.disabled = false;
        routeButton.textContent = "Show Route";
      }
    })();
  });
}

// ── Booking panel ─────────────────────────────────────────────────
function toTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function openBookingPanel(roomName: string, events: GlobalEvent[]): void {
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (!panel) return;

  panel.dataset.room = roomName;
  setText("roomTitle", roomName);

  const now = new Date();
  const upcomingToday = events.filter((e) => e.room === roomName && e.end >= now);

  const statusEl = optionalElement<HTMLElement>("roomStatus");
  if (statusEl) {
    statusEl.textContent = upcomingToday.length > 0 ? "OCCUPIED" : "AVAILABLE";
    statusEl.style.color = upcomingToday.length > 0 ? "#c62828" : "#2e7d32";
  }

  const listEl = optionalElement<HTMLElement>("roomBookingsList");
  if (listEl) {
    if (upcomingToday.length === 0) {
      listEl.innerHTML = `<p class="booking-empty">No upcoming bookings today</p>`;
    } else {
      const fmt = (d: Date): string =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      listEl.innerHTML = "";
      upcomingToday.forEach((e) => {
        const div = document.createElement("div");
        div.className = "booking-item";
        
        let cancelHtml = "";
        const prefix = currentUserEmail?.split("@")[0] ?? "";
        if (prefix === e.organizer) {
          cancelHtml = `<button type="button" class="btn cancel-btn" data-id="${e.id}" style="float:right; padding: 6px 12px; font-size: 0.9em; height: 32px; line-height: 1; background-color: #c62828;">Cancel</button>`;
        }
        
        div.innerHTML = `${cancelHtml}${fmt(e.start)}–${fmt(e.end)} · ${e.organizer} · ${e.title}`;
        
        const btn = div.querySelector(".cancel-btn") as HTMLButtonElement | null;
        if (btn) {
          btn.addEventListener("click", async () => {
            btn.disabled = true;
            btn.textContent = "Cancelling...";
            const res = await cancelBooking(e.id);
            if (res.success) {
              showToast("Booking cancelled", "success");
              div.remove(); // Instantly remove the booking from the UI
            } else {
              showToast(res.error || "Failed to cancel", "error");
              btn.disabled = false;
              btn.textContent = "Cancel";
            }
          });
        }
        listEl.appendChild(div);
      });
    }
  }

  // Default start = next round 30-min slot, end = +1h
  const rounded = new Date(Math.ceil(now.getTime() / (30 * 60000)) * 30 * 60000);
  const roundedEnd = new Date(rounded.getTime() + 60 * 60000);
  const startInput = optionalElement<HTMLInputElement>("bookStart");
  const endInput = optionalElement<HTMLInputElement>("bookEnd");
  if (startInput) startInput.value = toTimeInput(rounded);
  if (endInput) endInput.value = toTimeInput(roundedEnd);

  const bookBtn = optionalElement<HTMLButtonElement>("bookBtn");
  if (bookBtn) {
    if (upcomingToday.length > 0) {
      bookBtn.disabled = true;
      bookBtn.title = "Room is currently occupied or booked";
      bookBtn.style.opacity = "0.5";
      bookBtn.style.cursor = "not-allowed";
    } else {
      bookBtn.disabled = false;
      bookBtn.title = "";
      bookBtn.style.opacity = "1";
      bookBtn.style.cursor = "pointer";
    }
  }

  panel.style.display = "block";
}

export function closeBookingPanel(): void {
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (panel) panel.style.display = "none";
}

export function getBookingPanelRoom(): string | null {
  return optionalElement<HTMLElement>("bookingPanel")?.dataset.room ?? null;
}

export function refreshBookingPanelIfOpen(events: GlobalEvent[]): void {
  const roomName = getBookingPanelRoom();
  const panel = optionalElement<HTMLElement>("bookingPanel");
  if (roomName && panel && panel.style.display === "block") {
    openBookingPanel(roomName, events);
  }
}

export function getBookingTimes(): { start: Date; end: Date } | null {
  const startInput = optionalElement<HTMLInputElement>("bookStart");
  const endInput = optionalElement<HTMLInputElement>("bookEnd");
  if (!startInput?.value || !endInput?.value) return null;

  const today = new Date();
  const [sh, sm] = startInput.value.split(":").map(Number);
  const [eh, em] = endInput.value.split(":").map(Number);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), eh, em);
  return { start, end };
}

// ── Events card ───────────────────────────────────────────────────
export function displayAllEventsInCard(events: GlobalEvent[], showAllBookings = false): void {
  const card = optionalElement<HTMLElement>("roomDetailsCard");
  const cardContent = optionalElement<HTMLElement>("cardContent");
  if (!card || !cardContent) return;

  const now = new Date();
  const fmt = (d: Date): string =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const sorted = (showAllBookings ? [...events] : events.filter((e) => e.end >= now)).sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  if (sorted.length === 0) {
    cardContent.innerHTML = showAllBookings
      ? "<p>No bookings today.</p>"
      : "<p>No ongoing or upcoming meetings.</p>";
    card.style.display = "block";

    if (showAllBookings) setTimeout(() => { card.style.display = "none"; }, 6000);
    return;
  }

  const header = showAllBookings
    ? `<h4 class="card-header-title">All Today's Bookings</h4>`
    : "";

  cardContent.innerHTML =
    header +
    sorted
      .map((e) => {
        const isPast = e.end < now;
        return `
        <div class="meeting-card${isPast ? " meeting-past" : ""}">
          <b>${e.room}</b>${isPast ? ' <span class="past-badge">past</span>' : ""}<br/>
          <b>Meeting:</b> ${e.title}<br/>
          <b>By:</b> ${e.organizer}<br/>
          <b>Time:</b> ${fmt(e.start)} – ${fmt(e.end)}
        </div>`;
      })
      .join("");

  card.style.display = "block";
  if (showAllBookings) setTimeout(() => { card.style.display = "none"; }, 6000);
}

// ── Nav UI ────────────────────────────────────────────────────────
const FLOOR_SPINNER_MIN_MS = 900;
let floorSwitchInProgress = false;
let navigationAllowedFloors: Set<number> | null = null;
let loadingMessageTimer: number | null = null;
let loadingOverlayDepth = 0;
let cameraControlsLocked = false;
let cameraViewWarningShownAt = 0;
type CctvViewshedMode = "camera" | "coverage" | "blind" | "both";
let activeCctvCamera: CameraModel | null = null;
let activeCctvViewshedMode: CctvViewshedMode = "camera";
let cctvViewshedUiToken = 0;
let activeCameraControlFloor: number | null = null;
let lastHoverPickAt = 0;
const HOVER_PICK_INTERVAL_MS = 80;

function showExitCameraViewToast(): void {
  const now = Date.now();
  if (now - cameraViewWarningShownAt < 1500) return;
  cameraViewWarningShownAt = now;
  showToast("Exit camera view first to use this.", "error");
}

function getFloorButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[data-floor]"));
}

function applyFloorButtonAvailability(): void {
  getFloorButtons().forEach((button) => {
    const floor = Number(button.dataset.floor ?? "0");
    button.disabled = isCctvActive() || floorSwitchInProgress || Boolean(navigationAllowedFloors && !navigationAllowedFloors.has(floor));
    button.classList.toggle(
      "floor-route-active",
      Boolean(navigationAllowedFloors && navigationAllowedFloors.has(floor))
    );
  });
}

export function setNavigationAllowedFloors(floors: number[] | null): void {
  navigationAllowedFloors = floors ? new Set(floors) : null;
  const exitButton = optionalElement<HTMLButtonElement>("exitNavBtn");
  if (exitButton) exitButton.hidden = !floors;
  applyFloorButtonAvailability();
}

export function disableCameraControls(): void {
  cameraControlsLocked = true;
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const buttons = document.querySelectorAll("#cameraButtons button");
  if (panel) panel.style.display = "none";
  if (panel) panel.style.pointerEvents = "none";
  if (panel) panel.style.opacity = "0.5";
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = true;
  });
}

export function enableCameraControls(): void {
  cameraControlsLocked = false;
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const buttons = document.querySelectorAll("#cameraButtons button");
  if (panel) panel.style.pointerEvents = "auto";
  if (panel) panel.style.opacity = "1";
  buttons.forEach((btn) => {
    const button = btn as HTMLButtonElement;
    button.disabled = false;
  });
}

function setCameraViewControlsLocked(locked: boolean): void {
  document.body.classList.toggle("camera-view-active", locked);
  document.body.classList.remove("side-panel-open");

  const exitCard = optionalElement<HTMLElement>("cameraExitCard");
  const exitButton = optionalElement<HTMLButtonElement>("cameraViewExitBtn");
  if (exitCard) exitCard.hidden = !locked;
  if (exitButton) exitButton.disabled = !locked;

  const hamburger = optionalElement<HTMLButtonElement>("hamburgerMenu");
  if (hamburger) {
    hamburger.disabled = locked;
    hamburger.classList.remove("open");
    hamburger.title = locked ? "Exit camera view first" : "Toggle Controls";
    hamburger.setAttribute("aria-disabled", String(locked));
  }

  applyFloorButtonAvailability();
}

export function showFloorSpinner(text = "Loading floor…"): void {
  loadingOverlayDepth += 1;
  const overlay = document.getElementById("floorLoadingOverlay");
  const label = overlay?.querySelector<HTMLElement>(".floor-loading-text");
  if (label) label.textContent = text;
  overlay?.classList.toggle("third-floor-preview", /3rd\s+floor/i.test(text));
  overlay?.classList.add("active");
  disableInteractiveControlsDuringLoad();
  if (loadingMessageTimer !== null) window.clearInterval(loadingMessageTimer);
  if (!label) return;

  const messages = [
    text,
    "Loading floor model…",
    "Optimizing view…"
  ];
  let messageIndex = 0;
  loadingMessageTimer = window.setInterval(() => {
    messageIndex = (messageIndex + 1) % messages.length;
    label.textContent = messages[messageIndex];
  }, 900);
}

function showFloorSpinnerMessageOnce(text: string): void {
  if (loadingMessageTimer !== null) {
    window.clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }

  const label = document
    .getElementById("floorLoadingOverlay")
    ?.querySelector<HTMLElement>(".floor-loading-text");
  if (label) label.textContent = text;
}

export function hideFloorSpinner(): void {
  loadingOverlayDepth = Math.max(0, loadingOverlayDepth - 1);
  if (loadingOverlayDepth > 0) return;

  if (loadingMessageTimer !== null) {
    window.clearInterval(loadingMessageTimer);
    loadingMessageTimer = null;
  }
  const overlay = document.getElementById("floorLoadingOverlay");
  overlay?.classList.remove("active", "third-floor-preview");
  restoreInteractiveControlsAfterLoad();
}

// Disable interactive controls across the UI during loading overlay.
function disableInteractiveControlsDuringLoad(): void {
  document.body.classList.add("floor-loading-active");
  const overlay = document.getElementById("floorLoadingOverlay");
  const selector = "button,input,select,textarea,a[href],[role=button]";
  const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));
  controls.forEach((el) => {
    if (overlay && overlay.contains(el)) return; // don't disable overlay internals
    try {
      // Keep the original state if the loader is shown more than once in a transition.
      if ((el as any).dataset.prevDisabled === undefined) {
        const prev = (el as HTMLButtonElement).disabled ? "1" : "0";
        (el as any).dataset.prevDisabled = prev;
      }
      if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
        (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = true;
      } else {
        el.setAttribute("aria-disabled", "true");
      }
    } catch (e) {
      // ignore
    }
  });
}

function restoreInteractiveControlsAfterLoad(): void {
  document.body.classList.remove("floor-loading-active");
  const selector = "button,input,select,textarea,a[href],[role=button]";
  const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));
  controls.forEach((el) => {
    try {
      const prev = (el as any).dataset.prevDisabled;
      if (prev !== undefined) {
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
          (el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled = prev === "1";
        } else {
          el.removeAttribute("aria-disabled");
        }
        delete (el as any).dataset.prevDisabled;
      }
    } catch (e) {
      // ignore
    }
  });
}

function flyToPromise(options: any): Promise<void> {
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      ...options,
      complete: resolve,
      cancel: resolve,
    });
  });
}

export function flyToDefaultFloorView(duration = 1.15): Promise<void> {
  return flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133674, 28.670812, 48.08),
    orientation: {
      heading: Cesium.Math.toRadians(1.89),
      pitch: Cesium.Math.toRadians(-67.75),
      roll: 0,
    },
    duration,
    easingFunction: Cesium.EasingFunction.QUADRATIC_OUT,
  });
}

async function performWindowAnimation(floor: number): Promise<void> {
  const heightByFloor: Record<number, number> = {
    1: 1.2,
    2: 4.2,
    3: 7.8,
    4: 11.4,
  };

  const zHeight = heightByFloor[floor] ?? 7.8;

  await flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.670441, 25.51),
    orientation: {
      heading: Cesium.Math.toRadians(359.35),
      pitch: Cesium.Math.toRadians(-21.87),
      roll: 0,
    },
    duration: 1.35,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });

  await flyToPromise({
    destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.67085, zHeight),
    orientation: {
      heading: Cesium.Math.toRadians(359.35),
      pitch: Cesium.Math.toRadians(-4.5),
      roll: 0,
    },
    duration: 1.05,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });

  await flyToDefaultFloorView();
}

export function bindUiControls(callbacks: UiCallbacks): void {
  const floorButtons = getFloorButtons();

  floorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (isCctvActive()) {
        showExitCameraViewToast();
        return;
      }

      // Guard: ignore clicks while a switch is already in progress
      if (floorSwitchInProgress) return;

      const floor = Number(button.dataset.floor ?? "0");
      if (button.disabled) return;

      const floorName = button.textContent?.replace("Show ", "") ?? "floor";
      const label = floor === 0
        ? "Loading all floors…"
        : `Loading ${floorName}…`;
      const welcomeLabel = floor === 0
        ? "Welcome to all floors"
        : `Welcome to ${floorName}`;

      floorSwitchInProgress = true;
      applyFloorButtonAvailability();

      const doTransition = async () => {
        try {
          if (floor !== 0) {
            void callbacks.showFloor(0);
            const preloadPromise = floor === 3 || floor === 4
              ? Promise.resolve()
              : Promise.resolve(callbacks.preloadFloor?.(floor));
            await performWindowAnimation(floor);

            const loadPromise = Promise.resolve(callbacks.showFloor(floor));
            if (floor === 3) {
              await loadPromise;
              return;
            }

            showFloorSpinner(label);
            const minDelay = new Promise<void>((resolve) => setTimeout(resolve, FLOOR_SPINNER_MIN_MS));

            await Promise.allSettled([preloadPromise, loadPromise, minDelay]);
            showFloorSpinnerMessageOnce(welcomeLabel);
            await new Promise<void>((resolve) => setTimeout(resolve, 220));
            hideFloorSpinner();
          } else {
            await flyToPromise({
              destination: Cesium.Cartesian3.fromDegrees(77.133558, 28.670441, 25.51),
              orientation: {
                heading: Cesium.Math.toRadians(359.35),
                pitch: Cesium.Math.toRadians(-21.87),
                roll: 0,
              },
              duration: 1.5,
              easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
            });

            await Promise.resolve(callbacks.showFloor(0));
          }
        } finally {
          hideFloorSpinner();
          floorSwitchInProgress = false;
          applyFloorButtonAvailability();
        }
      };

      void doTransition();
    });
  });

  optionalElement<HTMLButtonElement>("startNavBtn")?.addEventListener("click", () => {
    if (isCctvActive()) {
      showExitCameraViewToast();
      return;
    }

    void callbacks.startNavigation();
  });

  optionalElement<HTMLButtonElement>("exitNavBtn")?.addEventListener("click", () => {
    callbacks.exitNavigation();
  });

  optionalElement<HTMLButtonElement>("swapRoomsBtn")?.addEventListener("click", () => {
    const fromRoom = element<HTMLSelectElement>("fromRoom");
    const toRoom = element<HTMLSelectElement>("toRoom");
    const fromValue = fromRoom.value;
    fromRoom.value = toRoom.value;
    toRoom.value = fromValue;
  });

  optionalElement<HTMLButtonElement>("chairCloseBtn")?.addEventListener("click", closeChairPopup);
  optionalElement<HTMLButtonElement>("panelCloseBtn")?.addEventListener("click", closeBookingPanel);
}

export function populateRoomDropdowns(names: string[]): void {
  const options = names.map((name) => `<option>${name}</option>`).join("");
  element<HTMLSelectElement>("fromRoom").innerHTML = options;
  element<HTMLSelectElement>("toRoom").innerHTML = options;
}

export function updateNavigationUI(summary: NavigationSummary): void {
  setText("fromNameDisplay", summary.fromName);
  setText("toNameDisplay", summary.toName);

  element<HTMLElement>("navSummary").innerHTML = `Walk ${summary.totalDistance} m &nbsp; ${summary.totalTime} min`;
  element<HTMLElement>("navSteps").innerHTML = summary.list
    .map(
      (step) => `
        <div class="nav-step">
          <div class="step-icon">${step.icon}</div>
          <div class="step-details">
            <div class="step-title">${step.title}</div>
            ${step.primary ? `<div class="step-box">${step.primary}</div>` : `<div class="step-text">${step.text ?? ""}</div>`}
          </div>
        </div>`
    )
    .join("");
}

export function setNavigationMessage(message: string, clearSteps = true): void {
  setText("navSummary", message);
  if (clearSteps) {
    element<HTMLElement>("navSteps").innerHTML = "";
  }
}

// ── Tooltip ───────────────────────────────────────────────────────
const NAVIGATION_HUD_ICONS: Record<NavigationHudState["icon"], string> = {
  forward: "&uarr;",
  left: "&larr;",
  right: "&rarr;",
  stairs: "&#8597;",
  arrive: "&#10003;",
};

export function updateNavigationHud(state: NavigationHudState): void {
  const hud = optionalElement<HTMLElement>("navigationHud");
  if (!hud) return;

  hud.hidden = false;
  hud.dataset.navIcon = state.icon;
  element<HTMLElement>("navigationHudIconLeft").innerHTML = NAVIGATION_HUD_ICONS[state.icon];
  element<HTMLElement>("navigationHudIconRight").innerHTML = NAVIGATION_HUD_ICONS[state.icon];
  setText("navigationHudInstruction", state.instruction);
  setText("navigationHudContext", state.context);
  setText("navigationHudDistance", `${Math.max(0, Math.round(state.distanceMeters))} m`);
}

export function hideNavigationHud(): void {
  const hud = optionalElement<HTMLElement>("navigationHud");
  if (hud) hud.hidden = true;
}

function showTooltip(html: string, x: number, y: number): void {
  const tooltip = element<HTMLElement>("tooltip");
  tooltip.innerHTML = html;
  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.style.display = "block";
}

function hideTooltip(): void {
  const tooltip = optionalElement<HTMLElement>("tooltip");
  if (tooltip) tooltip.style.display = "none";
}

// ── Chair popup ───────────────────────────────────────────────────
function showChairPopup(chair: ChairModel, selectedFloor: number): void {
  const rawName = chair.chairName || "Unknown";
  const isUnknown = rawName.toLowerCase().startsWith("unknown");
  setText("chairUser", rawName);
  setText("chairId", `CHAIR-${chair.chairIndex ?? "?"}`);
  setText(
    "chairFloor",
    selectedFloor === 4 ? "3rd Floor" : selectedFloor === 3 ? "2nd Floor" : "Unknown"
  );
  
  setText("chairStatus", isUnknown ? "Available" : "Occupied");
  const statusEl = optionalElement<HTMLElement>("chairStatus");
  if (statusEl) {
    statusEl.style.color = isUnknown ? "#2e7d32" : "#c62828";
  }
  
  element<HTMLElement>("chairPopup").style.display = "block";
}

function closeChairPopup(): void {
  element<HTMLElement>("chairPopup").style.display = "none";
}

// ── CCTV panel ────────────────────────────────────────────────────
function cameraTooltipHtml(camera: CameraModel): string {
  return `
    <b>CCTV Camera - ${camera.cameraName ?? "Unknown"}</b><br/>
    <b>Floor:</b> 3rd Floor<br/>
    <b>Height:</b> ${camera.cameraConfig.height.toFixed(1)} m<br/>
    <b>Heading:</b> ${camera.cameraConfig.heading}&deg;<br/>
    <b>Pitch:</b> ${camera.cameraConfig.pitch}&deg;<br/>
    Click to open camera view
  `;
}

function bindHoldButton(button: HTMLElement, onTick: () => void): void {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  const start = (): void => {
    if (intervalId !== null) return;
    onTick();
    intervalId = setInterval(onTick, 16);
  };
  const stop = (): void => {
    if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
  };
  button.addEventListener("mousedown", start);
  button.addEventListener("mouseup", stop);
  button.addEventListener("mouseleave", stop);
  button.addEventListener("touchstart", (e) => { e.preventDefault(); start(); }, { passive: false });
  button.addEventListener("touchend", stop);
  button.addEventListener("touchcancel", stop);
}

function getActiveViewshedFloor(): number | null {
  const floor = activeCctvCamera?.cameraFloor ?? activeCameraControlFloor;
  return floor === 3 || floor === 4 ? floor : null;
}

function getActiveFloorCameras(): CameraModel[] {
  const floor = getActiveViewshedFloor();
  if (!floor) return [];
  return models.cameras.filter((camera) => camera?.cameraConfig && camera.cameraFloor === floor);
}

function setViewshedStatus(stats: CctvCoverageStats | null): void {
  const node = optionalElement<HTMLElement>("cctvViewshedStats");
  if (!node) return;
  node.textContent = stats
    ? `Coverage ${stats.coveragePercent.toFixed(1)}% | Blind ${stats.blindPercent.toFixed(1)}%`
    : "";
}

function syncViewshedModeButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-cctv-viewshed]").forEach((button) => {
    const isActive = button.dataset.cctvViewshed === activeCctvViewshedMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

async function renderActiveCctvViewshed(): Promise<void> {
  const token = ++cctvViewshedUiToken;
  syncViewshedModeButtons();

  const camera = activeCctvCamera;
  const floor = getActiveViewshedFloor();
  if (!floor) {
    clearCctvViewshed();
    setViewshedStatus(null);
    return;
  }
  try {
    const floorCameras = getActiveFloorCameras();
    let stats: CctvCoverageStats;
    if (activeCctvViewshedMode === "coverage") {
      stats = await showCoverageOnly(floorCameras, floor);
    } else if (activeCctvViewshedMode === "blind") {
      stats = await showBlindSpots(floorCameras, floor);
    } else if (activeCctvViewshedMode === "both") {
      stats = await showCoverageAndBlindSpots(floorCameras, floor);
    } else if (camera) {
      stats = await showCameraViewshed(camera, floor);
    } else {
      stats = await showCoverageOnly(floorCameras, floor);
    }

    if (token === cctvViewshedUiToken) setViewshedStatus(stats);
  } catch (error) {
    console.warn("[CCTV Viewshed] Failed to render:", error);
    if (token === cctvViewshedUiToken) setViewshedStatus(null);
  }
}

function clearActiveCctvViewshed(): void {
  cctvViewshedUiToken += 1;
  activeCctvCamera = null;
  activeCctvViewshedMode = "camera";
  clearCctvViewshed();
  setViewshedStatus(null);
  syncViewshedModeButtons();
}

function syncCameraListSlider(): void {
  const list = optionalElement<HTMLElement>("cameraPanelBody");
  const slider = optionalElement<HTMLInputElement>("cameraListSlider");
  if (!list || !slider) return;

  const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
  slider.max = String(Math.ceil(maxScroll));
  slider.value = String(Math.min(Math.ceil(list.scrollTop), maxScroll));
  slider.hidden = maxScroll <= 1;
  slider.disabled = maxScroll <= 1;
}

function bindCameraListSlider(): void {
  const list = optionalElement<HTMLElement>("cameraPanelBody");
  const slider = optionalElement<HTMLInputElement>("cameraListSlider");
  if (!list || !slider || slider.dataset.bound === "1") return;

  slider.dataset.bound = "1";
  slider.addEventListener("input", () => {
    list.scrollTop = Number(slider.value);
  });
  list.addEventListener("scroll", syncCameraListSlider, { passive: true });
  window.addEventListener("resize", syncCameraListSlider);
}

function syncCameraPanelToggle(): void {
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const toggle = optionalElement<HTMLButtonElement>("cameraPanelToggle");
  if (!panel || !toggle) return;

  const isMinimized = panel.classList.contains("camera-panel-minimized");
  toggle.textContent = isMinimized ? "+" : "-";
  toggle.title = isMinimized ? "Maximize camera controls" : "Minimize camera controls";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.setAttribute("aria-expanded", String(!isMinimized));
}

function bindCameraPanelToggle(): void {
  const panel = optionalElement<HTMLElement>("cameraPanel");
  const toggle = optionalElement<HTMLButtonElement>("cameraPanelToggle");
  if (!panel || !toggle) return;

  if (toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      panel.classList.toggle("camera-panel-minimized");
      syncCameraPanelToggle();
      requestAnimationFrame(syncCameraListSlider);
    });
  }

  syncCameraPanelToggle();
}

function setDynamicButtonText(button: HTMLButtonElement, label: string): void {
  button.textContent = label;
  button.title = label;
  button.setAttribute("aria-label", label);

  const compactSize =
    label.length > 22 ? "9px" :
    label.length > 16 ? "10px" :
    label.length > 12 ? "11px" :
    label.length > 9 ? "12px" :
    "13px";
  button.style.fontSize = compactSize;
}

export function showCctvPanel(heading: number, pitch: number): void {
  setText("cctvHeadingDisplay", `${Math.round(heading)}°`);
  setText("cctvPitchDisplay", `${Math.round(pitch)}°`);
}

export function hideCctvPanel(): void {
  const panel = optionalElement<HTMLElement>("cctvPanel");
  if (panel) panel.style.display = "none";
  setCameraViewControlsLocked(false);
}

function exitCameraView(): void {
  clearActiveCctvViewshed();
  exitCctvMode();
  hideCctvPanel();
}

function updateCctvDebugInfo(): void {
  const info = getCctvDebugInfo();
  if (!info) return;

  const posText = `${info.position.lon.toFixed(6)}, ${info.position.lat.toFixed(6)}, ${info.position.height.toFixed(2)}`;
  const dirText = `${info.direction} (${Math.round(info.heading)}°, ${Math.round(info.pitch)}°)`;

  setText("cctvHeadingDisplay", `${Math.round(info.heading)}°`);
  setText("cctvPitchDisplay", `${Math.round(info.pitch)}°`);
  setText("cctvPosDisplay", posText);
  setText("cctvDirDisplay", dirText);
  setText("cctvZoomDisplay", `${Math.round(info.fov)}°`);
}

export function bindCctvPanel(): void {
  const leftBtn = optionalElement<HTMLButtonElement>("cctvLeft");
  const rightBtn = optionalElement<HTMLButtonElement>("cctvRight");
  const upBtn = optionalElement<HTMLButtonElement>("cctvUp");
  const downBtn = optionalElement<HTMLButtonElement>("cctvDown");
  const defaultBtn = optionalElement<HTMLButtonElement>("cctvDefault");
  const exitBtn = optionalElement<HTMLButtonElement>("cctvExit");
  const cameraViewExitBtn = optionalElement<HTMLButtonElement>("cameraViewExitBtn");
  if (!leftBtn || !rightBtn || !upBtn || !downBtn || !defaultBtn || !exitBtn) return;

  bindHoldButton(leftBtn, () => setCctvHeading(-0.6));
  bindHoldButton(rightBtn, () => setCctvHeading(0.6));
  bindHoldButton(upBtn, () => setCctvPitch(0.5));
  bindHoldButton(downBtn, () => setCctvPitch(-0.5));
  defaultBtn.addEventListener("click", resetCctvDefaultView);
  document.querySelectorAll<HTMLButtonElement>("[data-cctv-viewshed]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.cctvViewshed;
      if (mode === "clear") {
        clearActiveCctvViewshed();
        return;
      }
      if (mode !== "camera" && mode !== "coverage" && mode !== "blind" && mode !== "both") return;
      if (mode === activeCctvViewshedMode) return;
      activeCctvViewshedMode = mode;
      void renderActiveCctvViewshed();
    });
  });
  viewer.scene.preRender.addEventListener(updateCctvDebugInfo);

  exitBtn.addEventListener("click", exitCameraView);
  cameraViewExitBtn?.addEventListener("click", exitCameraView);
}

// ── Camera presets ────────────────────────────────────────────────
export function openCameraView(camera: CameraModel): void {
  if (!camera?.cameraConfig) {
    clearActiveCctvViewshed();
    showToast("Camera data is not ready yet.", "error");
    return;
  }

  clearCctvViewshed();
  activeCctvCamera = camera;
  enterCctvMode(camera.cameraConfig, (h, p) => {
    setText("cctvHeadingDisplay", `${Math.round(h)}°`);
    setText("cctvPitchDisplay", `${Math.round(p)}°`);
  }, camera);
  setCameraViewControlsLocked(true);
  showCctvPanel(camera.cameraConfig.heading, camera.cameraConfig.pitch);
  void renderActiveCctvViewshed();

  // Sync UI highlight
  const container = document.getElementById("cameraButtons");
  if (container) {
    container.querySelectorAll(".btn").forEach((b: any) => {
      const isActive = b.textContent === camera.cameraName || camera.cameraName?.includes(b.textContent);
      b.style.background = isActive ? "#1a3ea8" : "";
      b.style.color = isActive ? "#fff" : "";
    });
  }
}

export function renderCameraControls(floor: number): void {
  const panel = document.getElementById("cameraPanel");
  const container = document.getElementById("cameraButtons");
  if (!panel || !container) return;

  bindCameraPanelToggle();
  bindCameraListSlider();
  activeCameraControlFloor = floor === 3 || floor === 4 ? floor : null;
  const cameras = (FLOOR_CAMERAS[floor] || []).filter((camera) => camera.showInControls !== false);

  if (cameras.length === 0) {
    panel.style.display = "none";
    syncCameraListSlider();
    return;
  }

  container.innerHTML = "";
  cameras.forEach((cam) => {
    const row = document.createElement("div");
    row.className = "camera-coverage-row";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.type = "button";
    setDynamicButtonText(btn, cam.name);
    btn.disabled = cameraControlsLocked;
    btn.onclick = async () => {
      if (cameraControlsLocked) return;
      btn.disabled = true;
      try {
        await ensureFloorModelLoaded(floor);
        const model = getCameraByName(cam.name, floor);
        if (model) {
          openCameraView(model);
        } else {
          // Fallback to static config if model not found
          viewer.camera.setView({
            destination: cam.destination,
            orientation: cam.orientation,
          });
        }
      } finally {
        btn.disabled = false;
      }
    };
    const coverageBtn = document.createElement("button");
    coverageBtn.className = "btn";
    coverageBtn.type = "button";
    setDynamicButtonText(coverageBtn, "Coverage");
    coverageBtn.disabled = cameraControlsLocked;
    coverageBtn.onclick = async () => {
      if (cameraControlsLocked) return;
      coverageBtn.disabled = true;
      try {
        await ensureFloorModelLoaded(floor);
        const model = getCameraByName(cam.name, floor);
        if (!model) {
          showToast("Camera model is not ready yet.", "error");
          return;
        }
        activeCctvCamera = model;
        activeCctvViewshedMode = "camera";
        void renderActiveCctvViewshed();
      } finally {
        coverageBtn.disabled = false;
      }
    };

    row.appendChild(btn);
    row.appendChild(coverageBtn);
    container.appendChild(row);
  });

  panel.style.display = cameraControlsLocked ? "none" : "flex";
  panel.style.pointerEvents = cameraControlsLocked ? "none" : "auto";
  panel.style.opacity = cameraControlsLocked ? "0.5" : "1";
  requestAnimationFrame(syncCameraListSlider);
}



// ── Scene interactions ────────────────────────────────────────────
export function installSceneInteractions(
  getSelectedFloor: () => number,
  sceneCallbacks: SceneCallbacks = {}
): void {
  const warnIfCctvAction = (event?: Event): void => {
    if (!isCctvActive()) return;
    event?.preventDefault();
    event?.stopPropagation();
    showExitCameraViewToast();
  };

  const canvas = viewer.scene.canvas;
  canvas.addEventListener("pointerdown", warnIfCctvAction, { capture: true });
  canvas.addEventListener("touchstart", warnIfCctvAction, { capture: true, passive: false });
  canvas.addEventListener("wheel", warnIfCctvAction, { capture: true, passive: false });
  canvas.addEventListener("dblclick", warnIfCctvAction, { capture: true });
  canvas.addEventListener("contextmenu", warnIfCctvAction, { capture: true });
  canvas.addEventListener("pointermove", (event: PointerEvent) => {
    if (event.buttons) warnIfCctvAction(event);
  }, { capture: true });

  viewer.screenSpaceEventHandler.setInputAction(() => {
    if (isCctvActive()) showExitCameraViewToast();
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((click: { position: Cesium.Cartesian2 }) => {
    if (isCctvActive()) {
      showExitCameraViewToast();
      return;
    }

    const camera = getPickedCamera(click.position);
    if (camera) {
      openCameraView(camera);
      return;
    }


    const chair = getPickedChair(click.position);
    if (chair) {
      showChairPopup(chair, getSelectedFloor());
      return;
    }

    // Room polygon click → open booking panel
    const picked = viewer.scene.pick(click.position);
    const entity = picked?.id as Cesium.Entity | undefined;
    if (entity?.polygon) {
      const rawName = (entity.properties as any)?.room_name?.getValue?.() as string | undefined;
      if (rawName) {
        const roomName = matchRoomName(rawName);
        if (roomName && BOOKABLE_ROOMS.has(rawName.toLowerCase().trim())) {
          sceneCallbacks.onRoomClick?.(roomName);
        }
      }
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  viewer.screenSpaceEventHandler.setInputAction((movement: { endPosition: Cesium.Cartesian2 }) => {
    const now = performance.now();
    if (now - lastHoverPickAt < HOVER_PICK_INTERVAL_MS) return;
    lastHoverPickAt = now;

    if (lastHoveredChair) {
      highlightChair(lastHoveredChair);
      lastHoveredChair = null;
    }

    const selectedFloor = getSelectedFloor();
    if (selectedFloor === 3 || selectedFloor === 4) {
      const chair = getPickedChair(movement.endPosition);
      if (chair) {
        lastHoveredChair = chair;
        highlightChair(chair, Cesium.Color.BLUE);
        viewer.scene.canvas.style.cursor = "pointer";
        hideTooltip();
        viewer.scene.requestRender();
        return;
      }

      const camera = getPickedCamera(movement.endPosition);
      if (camera) {
        viewer.scene.canvas.style.cursor = "pointer";
        showTooltip(cameraTooltipHtml(camera), movement.endPosition.x, movement.endPosition.y);
        viewer.scene.requestRender();
        return;
      }
    }

    viewer.scene.canvas.style.cursor = "default";
    const picked = viewer.scene.pick(movement.endPosition);
    const entity = picked?.id as Cesium.Entity | undefined;
    if (!entity?.polygon) { hideTooltip(); return; }

    let html = "";
    const description = entity.description;
    if (typeof description === "string") {
      html = description;
    } else if (description && typeof description.getValue === "function") {
      html = description.getValue(viewer.clock.currentTime) ?? "";
    }
    if (!html) { hideTooltip(); return; }
    showTooltip(html, movement.endPosition.x, movement.endPosition.y);
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}
