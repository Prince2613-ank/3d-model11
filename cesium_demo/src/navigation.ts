import {
  Cesium,
  ALT_2ND,
  ALT_3RD,
  viewer
} from "./viewer";
import { geo2, geo3, geoJsonUrl, normalizeRoomName } from "./rooms";
import { chairNavPoints, loadChairsForFloor, extractAndCacheChairPositions, getActualChairPosition, findChairByName, type ChairModel } from "./chairs";
import { setNavigationAllowedFloors, setRoutePreviewAvailable, setNavigationMessage, updateNavigationUI, highlightNavStep, flyToDefaultFloorView, disableCameraControls, enableCameraControls, showFloorSpinner, hideFloorSpinner, hideNavigationHud, clearRoomPreviewEffect } from "./ui";
import { ensureFloorModelLoaded } from "./models";
import intermediatePointUrl from "../geodata/intermidiate_point.geojson?url";

type DoorFeature = {
  properties: { room_name: string };
  geometry: {
    type: "Point" | "Polygon" | "MultiPolygon";
    coordinates: any;
  };
};

type GraphNode = {
  pos: Cesium.Cartesian3;
  lon: number;
  lat: number;
  id: string | number;
  edges: GraphEdge[];
};

type GraphEdge = {
  node: GraphNode;
  w: number;
};

type CorridorDebugFeature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type: string;
    coordinates: [number, number];
  };
};

type CorridorDebugFileState = {
  fileName: string;
  graph: GraphNode[];
  features: CorridorDebugFeature[];
};

type CorridorDebugPointState = {
  entity: Cesium.Entity;
  node: GraphNode;
  floor: number;
  index: number;
};

type IntermediatePointFeature = {
  type: "Feature";
  properties?: {
    lat?: number;
    long?: number;
    id_no?: string;
    [key: string]: unknown;
  };
  geometry?: {
    type: string;
    coordinates: [number, number];
  };
};

type IntermediatePointState = {
  entity: Cesium.Entity;
  feature: IntermediatePointFeature;
  index: number;
  idNo: number;
};

type ResolvedRoomSelection = {
  displayName: string;
  roomName: string;
  floor: number;
};

type CorridorDrawNode = {
  id: string;
  lon: number;
  lat: number;
  entity: Cesium.Entity;
};

type CorridorDrawEdge = {
  fromId: string;
  toId: string;
  fromNode: CorridorDrawNode;
  toNode: CorridorDrawNode;
  entity: Cesium.Entity;
};

const doorPositions = new Map<string, Cesium.Cartesian3>();
let centerlineGraph2: GraphNode[] | null = null;
let centerlineGraph3: GraphNode[] | null = null;
let navDataReady = false;
let currentVisibleFloor = 0;
let corridorDebugLoaded = false;
const corridorDebugEntities: Array<{ entity: Cesium.Entity; floor: number; kind: "point" | "edge" }> = [];
const corridorDebugFiles = new Map<number, CorridorDebugFileState>();
const corridorDebugPoints = new Map<string, CorridorDebugPointState>();
const stairDebugEntities: Cesium.Entity[] = [];
const stairDebugPoints = new Map<string, { index: number; entity: Cesium.Entity }>();
let stairDebugUIActive = false;
let corridorDebugUIActive = false;
let corridorDebugUIEditable = false;
let stairDragUIEnabled = false;
const intermediateDebugEntities: Cesium.Entity[] = [];
const intermediateDebugPoints = new Map<string, IntermediatePointState>();
let intermediateDebugFeatures: IntermediatePointFeature[] = [];
let corridorDebugDragHandler: Cesium.ScreenSpaceEventHandler | null = null;
let stairDebugDragHandler: Cesium.ScreenSpaceEventHandler | null = null;
let intermediateDebugDragHandler: Cesium.ScreenSpaceEventHandler | null = null;
let selectedCorridorDebugPoint: CorridorDebugPointState | null = null;
let selectedStairDebugPoint: { index: number; entity: Cesium.Entity } | null = null;
let selectedIntermediateDebugPoint: IntermediatePointState | null = null;
let activeStairClimbPath: Cesium.Cartesian3[] = [];
let corridorDrawNodes: CorridorDrawNode[] = [];
let corridorDrawEdges: CorridorDrawEdge[] = [];
let corridorDrawHandler: Cesium.ScreenSpaceEventHandler | null = null;
type CorridorDrawMode = "node" | "connect" | null;
let corridorDrawMode: CorridorDrawMode = null;
let corridorConnectFirstId: string | null = null;
let corridorDrawNodeCounter = 0;

const routeTrackCollectionA = viewer.scene.primitives.add(new Cesium.PolylineCollection());
const routeTrackCollectionB = viewer.scene.primitives.add(new Cesium.PolylineCollection());
const routeGlowCollectionA = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeGlowCollectionB = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeNodeCollectionA = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
const routeNodeCollectionB = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
const routeLabelCollectionA = viewer.scene.primitives.add(new Cesium.LabelCollection());
const routeLabelCollectionB = viewer.scene.primitives.add(new Cesium.LabelCollection());

const ROAD_VIEW_EYE_HEIGHT_METERS = 0.85;
const ROAD_VIEW_LOOK_HEIGHT_METERS = 0.1;
const ROAD_VIEW_BACK_OFFSET_METERS = 0.9;
const ROAD_VIEW_FOV_DEGREES = 58;
const ROAD_VIEW_LOOK_AHEAD_STEPS = 1;

let liveNavTimer: number | null = null;
let liveNavPath: Cesium.Cartesian3[] = [];
let liveNavIndex = 0;
let liveNavCameraActive = false;
let navigationFloorSwitchHandler: ((floor: number) => void | Promise<void>) | null = null;
let routeAnimRemove: (() => void) | null = null;
let routeAnimStart = 0;
let routeFlowMatA: Cesium.Material | null = null;
let routeFlowMatB: Cesium.Material | null = null;
let routePathPointsA: Cesium.Cartesian3[] = [];
let routePathPointsB: Cesium.Cartesian3[] = [];
let previewAnimRemove: (() => void) | null = null;
let arrivalHudHideTimer: number | null = null;
let liveNavSteps: Array<{ startDist: number }> = [];
let liveNavFloorSwitchDistance: number | null = null;
let liveNavFloorSwitchTarget: number | null = null;
let liveNavFloorSwitchDone = false;
let liveNavFloorBreakIndex: number | null = null;
let activeDestinationPerson: { name: string; floor: 3 | 4 } | null = null;

const MAX_CORRIDOR_EDGE_METERS = 3.5;
const MAX_CORRIDOR_NEAREST_NEIGHBORS = 8;
const HOP_PENALTY_METERS = 0.4;
const CORRIDOR_DEBUG_PARAM = "corridorDebug";
const STAIR_DEBUG_PARAM = "stairDebug";
const INTERMEDIATE_DEBUG_PARAM = "intermediateDebug";
const INTERMIDIATE_DEBUG_PARAM = "intermidiateDebug";
const CORRIDOR_DEBUG_HEIGHT_OFFSET = 2.8;
const STAIR_DEBUG_HEIGHT_OFFSET = 4.0;

// Fixed full-floor overview camera shown on person-destination arrival (absolute height)
const INTERMEDIATE_DEBUG_HEIGHT_OFFSET = 4.4;
const SECOND_FLOOR_PANTRY_EMPLOYEE_SIDE_DOOR = Cesium.Cartesian3.fromDegrees(
  77.13362535043548,
  28.670995911296629,
  ALT_2ND + 0.1
);
const THIRD_FLOOR_PANTRY_NEAR_CONFERENCE_DOOR = Cesium.Cartesian3.fromDegrees(
  77.13371705946003,
  28.67095703850098,
  ALT_3RD + 0.1
);
const THIRD_FLOOR_PANTRY_LOWER_DOOR = Cesium.Cartesian3.fromDegrees(
  77.13372663090223,
  28.67092052705272,
  ALT_3RD + 0.1
);
const THIRD_FLOOR_CONFERENCE_ROOM_INSIDE = Cesium.Cartesian3.fromDegrees(
  77.133630,
  28.670958,
  ALT_3RD
);
const THIRD_FLOOR_LIBRARY_POSITION = Cesium.Cartesian3.fromDegrees(
  77.133680,
  28.670900,
  ALT_3RD
);

const ROUTE_GLOW_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140" viewBox="0 0 140 140">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
      <stop offset="20%" stop-color="#00DDFF" stop-opacity="0.80"/>
      <stop offset="55%" stop-color="#0066FF" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#0044FF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="70" cy="70" r="65" fill="url(#g)"/>
</svg>
`)}`;


// Stair path: 2nd floor entry → spiral up → 3rd floor exit.
// Points spaced ~0.5 m apart along the staircase to give a clear climb visual.
// Use Stair Debug panel (Drag Edit) to fine-tune these positions.
const CUSTOM_STAIR_PATH = [
  { lon: 77.13369898351728, lat: 28.670912218623947 }, // 1 — 2nd floor entry
  { lon: 77.13369578,       lat: 28.67091690 },        // 2
  { lon: 77.13369100,       lat: 28.67092100 },        // 3
  { lon: 77.13368746,       lat: 28.67092650 },        // 4 — mid lower
  { lon: 77.13368900,       lat: 28.67093200 },        // 5 — landing
  { lon: 77.13369400,       lat: 28.67093650 },        // 6
  { lon: 77.13369900,       lat: 28.67093350 },        // 7 — mid upper
  { lon: 77.13370144,       lat: 28.67092900 },        // 8
  { lon: 77.13370400,       lat: 28.67092714 },        // 9 — 3rd floor exit
];

// Height interpolation across the stair path.
// The landing sits at the midpoint index; both halves ramp linearly through it.
function stairPointHeight(index: number, total: number, startAlt: number, targetAlt: number): number {
  if (total <= 1) return startAlt;
  const t = index / (total - 1);
  return startAlt + (targetAlt - startAlt) * t;
}

function clearRouteEntities(): void {
  viewer.entities.removeById("debugDoorStart");
  viewer.entities.removeById("debugDoorEnd");
  viewer.entities.removeById("debugCorridorStart");
  viewer.entities.removeById("debugCorridorEnd");
  viewer.entities.removeById("navigationLineA");
  viewer.entities.removeById("navigationLineB");
  viewer.entities.removeById("stairsLine");
  viewer.entities.removeById("startMarker");
  viewer.entities.removeById("endMarker");
  viewer.entities.removeById("navMarkerDot");
  viewer.entities.removeById("liveNavigationMarker");
  routeTrackCollectionA.removeAll();
  routeTrackCollectionB.removeAll();
  routeFlowMatA = null;
  routeFlowMatB = null;
  routePathPointsA = [];
  routePathPointsB = [];
  routeGlowCollectionA.removeAll();
  routeGlowCollectionB.removeAll();
  routeNodeCollectionA.removeAll();
  routeNodeCollectionB.removeAll();
  routeLabelCollectionA.removeAll();
  routeLabelCollectionB.removeAll();
  if (routeAnimRemove !== null) {
    routeAnimRemove();
    routeAnimRemove = null;
  }
  if (previewAnimRemove) { previewAnimRemove(); previewAnimRemove = null; }
  setRoutePreviewAvailable(false);
}

function stopLiveNavigationMarker(): void {
  if (liveNavTimer !== null) {
    window.clearInterval(liveNavTimer);
    liveNavTimer = null;
  }
  liveNavPath = [];
  liveNavIndex = 0;
  liveNavFloorSwitchDistance = null;
  liveNavFloorSwitchTarget = null;
  liveNavFloorSwitchDone = false;
  liveNavFloorBreakIndex = null;

  liveNavCameraActive = false;
  viewer.entities.removeById("liveNavigationMarker");
  hideNavigationHud();
}


function offsetAlongLocalUp(position: Cesium.Cartesian3, meters: number): Cesium.Cartesian3 {
  const up = Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3());
  return Cesium.Cartesian3.add(
    position,
    Cesium.Cartesian3.multiplyByScalar(up, meters, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
}

function applyRoadNavigationView(index: number, smooth = true, flyDuration = 0.18, lookAheadSteps = ROAD_VIEW_LOOK_AHEAD_STEPS): void {
  if (liveNavPath.length < 2) return;

  const current = liveNavPath[index];
  const next = liveNavPath[Math.min(index + lookAheadSteps, liveNavPath.length - 1)] ?? current;
  const previous = liveNavPath[Math.max(index - 1, 0)] ?? current;
  const forwardSource = Cesium.Cartesian3.distance(current, next) > 0.05 ? next : previous;
  const forward = Cesium.Cartesian3.subtract(forwardSource, current, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(forward) < 0.000001) return;

  Cesium.Cartesian3.normalize(forward, forward);
  const localUp = Cesium.Cartesian3.normalize(current, new Cesium.Cartesian3());
  const eyeBase = offsetAlongLocalUp(current, ROAD_VIEW_EYE_HEIGHT_METERS);
  const eye = Cesium.Cartesian3.subtract(
    eyeBase,
    Cesium.Cartesian3.multiplyByScalar(forward, ROAD_VIEW_BACK_OFFSET_METERS, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const target = offsetAlongLocalUp(forwardSource, ROAD_VIEW_LOOK_HEIGHT_METERS);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(target, eye, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );
  const right = Cesium.Cartesian3.cross(direction, localUp, new Cesium.Cartesian3());
  if (Cesium.Cartesian3.magnitudeSquared(right) < 0.000001) return;

  Cesium.Cartesian3.normalize(right, right);
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3()
  );

  if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
    viewer.camera.frustum.fov = Cesium.Math.toRadians(ROAD_VIEW_FOV_DEGREES);
  }

  if (!smooth) {
    viewer.camera.setView({
      destination: eye,
      orientation: { direction, up }
    });
    return;
  }

  if (typeof (viewer.camera as any).cancelFlight === "function") {
    (viewer.camera as any).cancelFlight();
  }
  const easing = flyDuration > 0.3
    ? Cesium.EasingFunction.LINEAR_NONE
    : Cesium.EasingFunction.QUADRATIC_IN_OUT;
  viewer.camera.flyTo({
    destination: eye,
    orientation: { direction, up },
    duration: flyDuration,
    easingFunction: easing,
  });
}











export function setNavigationFloorSwitchHandler(
  handler: ((floor: number) => void | Promise<void>) | null
): void {
  navigationFloorSwitchHandler = handler;
}

export let activeNavFromFloor: number | null = null;
export let activeNavToFloor: number | null = null;

export function exitNavigation(): void {
  if (arrivalHudHideTimer !== null) {
    window.clearTimeout(arrivalHudHideTimer);
    arrivalHudHideTimer = null;
  }
  stopLiveNavigationMarker();
  clearRouteEntities();
  activeNavFromFloor = null;
  activeNavToFloor = null;
  activeStairClimbPath = [];
  activeDestinationPerson = null;
  setNavigationAllowedFloors(null);
  enableCameraControls();
  setNavigationMessage("Choose rooms to start navigation.");
  viewer.scene.requestRender();
}

export function startNavigationCameraView(): void {
  if (liveNavPath.length < 2 || liveNavCameraActive) return;
  liveNavCameraActive = true;
  disableCameraControls();
  applyRoadNavigationView(liveNavIndex, false);
  viewer.scene.requestRender();
}

export function isNavigationCameraActive(): boolean {
  return liveNavCameraActive;
}

/**
 * Bounces a chair vertically along true world-up (not the model's own local Z,
 * whose axis is scrambled by the yaw/pitch/roll baked into computeMatrix()) so
 * arriving at a seat destination gets a visible "you're here" cue, like a map
 * pin bounce. Also tints the chair red and drops a red marker at its exact
 * position for the duration. Settles back to the chair's original transform
 * and color, and removes the marker, when done.
 */
export function bounceChair(chair: ChairModel, durationMs = 3400, amplitudeMeters = 0.4): void {
  const originalMatrix = Cesium.Matrix4.clone(chair.modelMatrix);
  const originalColor = Cesium.Color.clone(chair.color);
  const center = chair.boundingSphere?.center ?? Cesium.Matrix4.getTranslation(originalMatrix, new Cesium.Cartesian3());
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center);
  const upColumn = Cesium.Matrix4.getColumn(enu, 2, new Cesium.Cartesian4());
  const worldUp = new Cesium.Cartesian3(upColumn.x, upColumn.y, upColumn.z);

  chair.color = Cesium.Color.RED;

  const marker = viewer.entities.add({
    position: Cesium.Cartesian3.clone(center),
    point: {
      pixelSize: 16,
      color: Cesium.Color.RED,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.NONE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    } as any,
  });

  const start = performance.now();
  const scratchTranslation = new Cesium.Cartesian3();
  const scratchTranslationMatrix = new Cesium.Matrix4();

  function tick(): void {
    const elapsed = performance.now() - start;
    if (elapsed >= durationMs) {
      chair.modelMatrix = originalMatrix;
      chair.color = originalColor;
      viewer.entities.remove(marker);
      viewer.scene.requestRender();
      return;
    }

    // Ease the bounce amplitude down over the duration so it settles rather than cutting off abruptly.
    const decay = 1 - elapsed / durationMs;
    const offset = amplitudeMeters * decay * Math.abs(Math.sin(elapsed / 75));
    Cesium.Cartesian3.multiplyByScalar(worldUp, offset, scratchTranslation);
    Cesium.Matrix4.fromTranslation(scratchTranslation, scratchTranslationMatrix);
    Cesium.Matrix4.multiply(scratchTranslationMatrix, originalMatrix, chair.modelMatrix);
    viewer.scene.requestRender();
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

/** Returns true if a seat was found and its bounce animation started. */
function bounceDestinationChairIfSeat(): boolean {
  if (!activeDestinationPerson) return false;
  const chair = findChairByName(activeDestinationPerson.name, activeDestinationPerson.floor);
  if (!chair) return false;
  bounceChair(chair);
  return true;
}

export function flyRoutePreview(): void {
  if (liveNavPath.length < 2) return;
  if (previewAnimRemove) { previewAnimRemove(); previewAnimRemove = null; }

  disableCameraControls();
  if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
    viewer.camera.frustum.fov = Cesium.Math.toRadians(ROAD_VIEW_FOV_DEGREES);
  }

  const path = liveNavPath;
  liveNavFloorSwitchDone = false;
  if (activeNavFromFloor !== null) {
    void Promise.resolve(navigationFloorSwitchHandler?.(activeNavFromFloor));
  }

  // Build arc-length table so we can sample any position by distance
  const cumLen: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const segmentDistance = liveNavFloorBreakIndex === i - 1
      ? 0
      : Cesium.Cartesian3.distance(path[i - 1], path[i]);
    cumLen.push(cumLen[i - 1] + segmentDistance);
  }
  const totalLen = cumLen[cumLen.length - 1];

  // Return world position at arc-length s along the path
  function posAtS(s: number): Cesium.Cartesian3 {
    s = Math.max(0, Math.min(totalLen, s));
    for (let i = 1; i < cumLen.length; i++) {
      if (cumLen[i] >= s) {
        const segmentLength = cumLen[i] - cumLen[i - 1];
        if (segmentLength <= 0.000001) {
          return Cesium.Cartesian3.clone(path[i]);
        }
        const t = (s - cumLen[i - 1]) / segmentLength;
        return Cesium.Cartesian3.lerp(path[i - 1], path[i], t, new Cesium.Cartesian3());
      }
    }
    return Cesium.Cartesian3.clone(path[path.length - 1]);
  }

  // Aim 1.5m ahead along the path — stays straight on straights, curves naturally at turns
  const LOOK_AHEAD_M = 1.5;
  const SPEED_MPS = 1.00;

  let currentS = 0;
  let lastTime = performance.now();
  let lastHighlightedStep = -1;

  function updateStepHighlight(s: number): void {
    if (liveNavSteps.length === 0) return;
    let stepIdx = 0;
    for (let i = liveNavSteps.length - 1; i >= 0; i--) {
      if (s >= liveNavSteps[i].startDist) { stepIdx = i; break; }
    }
    if (stepIdx !== lastHighlightedStep) {
      lastHighlightedStep = stepIdx;
      highlightNavStep(stepIdx);
    }
  }

  function updatePreviewFloorSwitch(s: number): void {
    if (
      liveNavFloorSwitchDone ||
      liveNavFloorSwitchDistance === null ||
      liveNavFloorSwitchTarget === null ||
      s < liveNavFloorSwitchDistance
    ) {
      return;
    }
    liveNavFloorSwitchDone = true;
    void Promise.resolve(navigationFloorSwitchHandler?.(liveNavFloorSwitchTarget));
  }

  // Place camera at start immediately
  const p0 = posAtS(0);
  const snapEye = offsetAlongLocalUp(p0, ROAD_VIEW_EYE_HEIGHT_METERS);
  const snapAim = offsetAlongLocalUp(posAtS(LOOK_AHEAD_M), ROAD_VIEW_LOOK_HEIGHT_METERS);
  const snapDir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(snapAim, snapEye, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const snapLU = Cesium.Cartesian3.normalize(p0, new Cesium.Cartesian3());
  const snapR = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(snapDir, snapLU, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  const snapUp = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(snapR, snapDir, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  viewer.camera.setView({ destination: snapEye, orientation: { direction: snapDir, up: snapUp } });

  const onRender = () => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    currentS += SPEED_MPS * dt;

    if (currentS >= totalLen) {
      viewer.scene.postRender.removeEventListener(onRender);
      previewAnimRemove = null;
      enableCameraControls();
      highlightNavStep(liveNavSteps.length - 1);
      // If we just arrived at a seat, let the bounce play out at this close-up
      // arrival view before pulling the camera back — flying out immediately
      // made the small vertical hop invisible.
      const bouncingSeat = bounceDestinationChairIfSeat();
      if (bouncingSeat) {
        window.setTimeout(() => { void flyToDefaultFloorView(1.4); }, 2300);
      } else {
        void flyToDefaultFloorView(1.4);
      }
      return;
    }

    updateStepHighlight(currentS);
    updatePreviewFloorSwitch(currentS);

    const eyePos  = posAtS(currentS);
    const aimPos  = posAtS(currentS + LOOK_AHEAD_M);
    const localUp = Cesium.Cartesian3.normalize(eyePos, new Cesium.Cartesian3());
    const eye     = offsetAlongLocalUp(eyePos, ROAD_VIEW_EYE_HEIGHT_METERS);
    const aimElev = offsetAlongLocalUp(aimPos, ROAD_VIEW_LOOK_HEIGHT_METERS);

    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(aimElev, eye, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    const right = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(direction, localUp, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    if (Cesium.Cartesian3.magnitudeSquared(right) < 0.000001) return;
    const up = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    viewer.camera.setView({ destination: eye, orientation: { direction, up } });
    viewer.scene.requestRender();
  };

  viewer.scene.postRender.addEventListener(onRender);
  previewAnimRemove = () => {
    viewer.scene.postRender.removeEventListener(onRender);
    enableCameraControls();
  };
}

export function updateNavigationVisibility(activeFloor: number): void {
  currentVisibleFloor = activeFloor;

  const showA = activeFloor === activeNavFromFloor;
  const showB = activeFloor === activeNavToFloor;
  const showStairs = activeFloor === activeNavFromFloor || activeFloor === activeNavToFloor;
  
  const lineA = viewer.entities.getById("navigationLineA");
  if (lineA) lineA.show = false;

  const lineB = viewer.entities.getById("navigationLineB");
  if (lineB) lineB.show = false;

  const stairs = viewer.entities.getById("stairsLine");
  if (stairs) stairs.show = showStairs;
  
  const dot = viewer.entities.getById("navMarkerDot");
  if (dot) dot.show = showStairs;

  const liveMarker = viewer.entities.getById("liveNavigationMarker");
  if (liveMarker) liveMarker.show = showStairs;

  const startMarker = viewer.entities.getById("startMarker");
  if (startMarker) startMarker.show = showA;

  const endMarker = viewer.entities.getById("endMarker");
  if (endMarker) endMarker.show = showB;

  routeTrackCollectionA.show = showA;
  routeTrackCollectionB.show = showB;
  routeGlowCollectionA.show = showA;
  routeGlowCollectionB.show = showB;
  routeNodeCollectionA.show = showA;
  routeNodeCollectionB.show = showB;
  routeLabelCollectionA.show = showA;
  routeLabelCollectionB.show = showB;
  corridorDebugEntities.forEach(({ entity, floor }) => {
    entity.show = activeFloor === 0 || activeFloor === floor;
  });
  const showCorridorDraw = activeFloor === 0 || activeFloor === 3;
  corridorDrawNodes.forEach(({ entity }) => { entity.show = showCorridorDraw; });
  corridorDrawEdges.forEach(({ entity }) => { entity.show = showCorridorDraw; });
  stairDebugEntities.forEach((entity) => {
    entity.show = stairDebugEnabled();
  });
  intermediateDebugEntities.forEach((entity) => {
    entity.show = intermediateDebugEnabled();
  });

  if (activeNavFromFloor && activeNavToFloor) {
    let message = "Continue navigation on this floor.";
    if (activeNavFromFloor !== activeNavToFloor && activeFloor === activeNavFromFloor) {
      message = "Proceed to stairs, then switch floor to continue.";
    }
    setNavigationMessage(message, false);
  }
}

function corridorDebugEnabled(): boolean {
  if (corridorDebugUIActive) return true;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(CORRIDOR_DEBUG_PARAM);
  return value === "1" || value === "true" || value === "points" || value === "edit";
}

function corridorDebugEditable(): boolean {
  if (corridorDebugUIEditable) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get(CORRIDOR_DEBUG_PARAM) === "edit";
}

function corridorDebugAltitude(floor: number): number {
  return (floor === 3 ? ALT_2ND : ALT_3RD) + CORRIDOR_DEBUG_HEIGHT_OFFSET;
}

function corridorDebugPosition(node: GraphNode, floor: number): Cesium.Cartesian3 {
  return Cesium.Cartesian3.fromDegrees(node.lon, node.lat, corridorDebugAltitude(floor));
}

function setCorridorDebugNodePosition(point: CorridorDebugPointState, lon: number, lat: number): void {
  const routeAltitude = point.floor === 3 ? ALT_2ND : ALT_3RD;
  point.node.lon = lon;
  point.node.lat = lat;
  point.node.pos = Cesium.Cartesian3.fromDegrees(lon, lat, routeAltitude + 0.1);
  point.entity.position = new Cesium.ConstantPositionProperty(corridorDebugPosition(point.node, point.floor));

  const fileState = corridorDebugFiles.get(point.floor);
  const feature = fileState?.features[point.index];
  if (feature?.geometry?.type === "Point") {
    feature.geometry.coordinates = [lon, lat];
    if (feature.properties) {
      feature.properties.Longitude = lon;
      feature.properties.Latitude = lat;
    }
  }

  if (fileState) {
    rebuildCenterlineGraphEdges(fileState.graph);
    redrawCorridorDebugEdges(point.floor);
  }
}

function pickCorridorDebugLonLat(position: Cesium.Cartesian2): { lon: number; lat: number } | null {
  const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
  if (!cartesian) return null;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    lat: Cesium.Math.toDegrees(cartographic.latitude),
  };
}

export function exportCorridorDebugGeoJSON(): void {
  corridorDebugFiles.forEach((fileState) => {
    const geoJson = {
      type: "FeatureCollection",
      name: fileState.fileName.replace(".geojson", ""),
      features: fileState.features,
    };
    console.info(`Updated ${fileState.fileName}`, JSON.stringify(geoJson, null, 2));
  });
}

function installCorridorDebugEditor(): void {
  if (!corridorDebugEditable() || corridorDebugDragHandler) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  corridorDebugDragHandler = handler;

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(event.position);
    const entity = picked?.id instanceof Cesium.Entity ? picked.id : null;
    const point = entity ? corridorDebugPoints.get(String(entity.id)) : null;
    if (!point) return;

    selectedCorridorDebugPoint = point;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
    if (!selectedCorridorDebugPoint) return;

    const picked = pickCorridorDebugLonLat(event.endPosition);
    if (!picked) return;

    setCorridorDebugNodePosition(selectedCorridorDebugPoint, picked.lon, picked.lat);
    viewer.scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (!selectedCorridorDebugPoint) return;

    selectedCorridorDebugPoint = null;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    exportCorridorDebugGeoJSON();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "e") {
      exportCorridorDebugGeoJSON();
    }
  });
}

function addCorridorDebugGraph(graph: GraphNode[], floor: number, fileName: string): void {
  const color = floor === 3
    ? Cesium.Color.fromCssColorString("#00D5FF")
    : Cesium.Color.fromCssColorString("#FFB000");
  const floorLabel = floor === 3 ? "2F" : "3F";

  graph.forEach((node, index) => {
    const pointEntity = viewer.entities.add({
      id: `debugCorridorPoint-${floor}-${index}`,
      position: corridorDebugPosition(node, floor),
      point: {
        pixelSize: corridorDebugEditable() ? 17 : 14,
        color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${floorLabel}-${node.id}`,
        font: "13px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.55),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    corridorDebugEntities.push({ entity: pointEntity, floor, kind: "point" });
    corridorDebugPoints.set(String(pointEntity.id), { entity: pointEntity, node, floor, index });
  });

  addCorridorDebugEdges(graph, floor, color);

  console.info(`${fileName}: debug points are ${CORRIDOR_DEBUG_HEIGHT_OFFSET}m above floor ${floor === 3 ? "2nd" : "3rd"}.`);
}

function addCorridorDebugEdges(graph: GraphNode[], floor: number, color: Cesium.Color): void {
  graph.forEach((node, index) => {
    node.edges.forEach((edge) => {
      const edgeIndex = graph.indexOf(edge.node);
      if (edgeIndex <= index) return;

      const lineEntity = viewer.entities.add({
        id: `debugCorridorEdge-${floor}-${index}-${edgeIndex}`,
        polyline: {
          positions: new Cesium.CallbackProperty(
            () => [corridorDebugPosition(node, floor), corridorDebugPosition(edge.node, floor)],
            false
          ),
          width: 3,
          material: color.withAlpha(0.62),
          clampToGround: false,
        },
      });

      corridorDebugEntities.push({ entity: lineEntity, floor, kind: "edge" });
    });
  });
}

function redrawCorridorDebugEdges(floor: number): void {
  for (let index = corridorDebugEntities.length - 1; index >= 0; index -= 1) {
    const item = corridorDebugEntities[index];
    if (item.floor !== floor || item.kind !== "edge") continue;

    viewer.entities.remove(item.entity);
    corridorDebugEntities.splice(index, 1);
  }

  const graph = corridorDebugFiles.get(floor)?.graph;
  if (!graph) return;

  const color = floor === 3
    ? Cesium.Color.fromCssColorString("#00D5FF")
    : Cesium.Color.fromCssColorString("#FFB000");
  addCorridorDebugEdges(graph, floor, color);
  updateNavigationVisibility(currentVisibleFloor);
}

export async function installCorridorPointDebug(): Promise<void> {
  if (!corridorDebugEnabled() || corridorDebugLoaded) return;
  corridorDebugLoaded = true;

  const [graph2, graph3, geoJson2Response, geoJson3Response] = await Promise.all([
    centerlineGraph2 ? Promise.resolve(centerlineGraph2) : loadCenterlineGeoJSON("2nd_floor_corridor.geojson", ALT_2ND),
    centerlineGraph3 ? Promise.resolve(centerlineGraph3) : loadCenterlineGeoJSON("3rd_floor_corridor.geojson", ALT_3RD),
    fetch(geoJsonUrl("2nd_floor_corridor.geojson")),
    fetch(geoJsonUrl("3rd_floor_corridor.geojson")),
  ]);
  const [geoJson2, geoJson3] = await Promise.all([
    geoJson2Response.json() as Promise<{ features: CorridorDebugFeature[] }>,
    geoJson3Response.json() as Promise<{ features: CorridorDebugFeature[] }>,
  ]);

  centerlineGraph2 = graph2;
  centerlineGraph3 = graph3;
  corridorDebugFiles.set(3, {
    fileName: "2nd_floor_corridor.geojson",
    graph: graph2,
    features: geoJson2.features.filter((feature) => feature.geometry?.type === "Point"),
  });
  corridorDebugFiles.set(4, {
    fileName: "3rd_floor_corridor.geojson",
    graph: graph3,
    features: geoJson3.features.filter((feature) => feature.geometry?.type === "Point"),
  });

  addCorridorDebugGraph(graph2, 3, "2nd_floor_corridor.geojson");
  addCorridorDebugGraph(graph3, 4, "3rd_floor_corridor.geojson");
  installCorridorDebugEditor();
  updateNavigationVisibility(currentVisibleFloor);
  console.info(
    corridorDebugEditable()
      ? `Corridor edit debug: drag points to update. Release mouse or press E to print updated GeoJSON.`
      : `Corridor debug: ${graph2.length} second-floor points, ${graph3.length} third-floor points.`
  );
  viewer.scene.requestRender();
}

export async function showCorridorDebugUI(editable: boolean): Promise<void> {
  corridorDebugUIActive = true;
  corridorDebugUIEditable = editable;
  corridorDebugLoaded = false; // allow reload if toggling edit mode
  await installCorridorPointDebug();
}

export function clearCorridorDebugUI(): void {
  for (const { entity } of corridorDebugEntities) {
    viewer.entities.remove(entity);
  }
  corridorDebugEntities.length = 0;
  corridorDebugPoints.clear();
  corridorDebugFiles.clear();
  if (corridorDebugDragHandler) {
    corridorDebugDragHandler.destroy();
    corridorDebugDragHandler = null;
  }
  corridorDebugLoaded = false;
  corridorDebugUIActive = false;
  corridorDebugUIEditable = false;
  viewer.scene.requestRender();
}

// ── Corridor Draw Tool ────────────────────────────────────────────────────────

function corridorDrawAlt(): number {
  return ALT_2ND + 0.2;
}

function addCorridorDrawNodeEntity(lon: number, lat: number): CorridorDrawNode {
  const num = ++corridorDrawNodeCounter;
  const id = `cdraw-node-${num}`;
  const entity = viewer.entities.add({
    id,
    position: new Cesium.ConstantPositionProperty(
      Cesium.Cartesian3.fromDegrees(lon, lat, corridorDrawAlt())
    ),
    point: {
      pixelSize: 14,
      color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: String(num),
      font: "bold 10px sans-serif",
      pixelOffset: new Cesium.Cartesian2(12, -12),
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 0.8,
    },
  });
  const node: CorridorDrawNode = { id, lon, lat, entity };
  corridorDrawNodes.push(node);
  viewer.scene.requestRender();
  return node;
}

function highlightCorridorDrawNode(id: string, selected: boolean): void {
  const node = corridorDrawNodes.find(n => n.id === id);
  if (!node?.entity.point) return;
  (node.entity.point.color as Cesium.ConstantProperty).setValue(
    selected ? Cesium.Color.LIME : Cesium.Color.YELLOW
  );
  viewer.scene.requestRender();
}

function addCorridorDrawEdgeEntity(fromId: string, toId: string): void {
  const fromNode = corridorDrawNodes.find(n => n.id === fromId);
  const toNode = corridorDrawNodes.find(n => n.id === toId);
  if (!fromNode || !toNode) return;
  const dup = corridorDrawEdges.some(e =>
    (e.fromId === fromId && e.toId === toId) ||
    (e.fromId === toId && e.toId === fromId)
  );
  if (dup) return;
  const alt = corridorDrawAlt();
  const entity = viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(() => [
        Cesium.Cartesian3.fromDegrees(fromNode.lon, fromNode.lat, alt),
        Cesium.Cartesian3.fromDegrees(toNode.lon, toNode.lat, alt),
      ], false),
      width: 3,
      material: new Cesium.ColorMaterialProperty(Cesium.Color.CYAN),
    },
  });
  corridorDrawEdges.push({ fromId, toId, fromNode, toNode, entity });
  viewer.scene.requestRender();
}

function handleCorridorDrawClick(screenPos: Cesium.Cartesian2): void {
  if (!corridorDrawMode) return;

  const picked = viewer.scene.pick(screenPos);
  const pickedEntity = picked?.id instanceof Cesium.Entity ? picked.id : null;
  const clickedNode = pickedEntity
    ? (corridorDrawNodes.find(n => n.entity === pickedEntity) ?? null)
    : null;

  if (corridorDrawMode === "node") {
    const cartesian = viewer.scene.pickPosition(screenPos)
      ?? viewer.camera.pickEllipsoid(screenPos)
      ?? null;
    if (!cartesian) return;
    const carto = Cesium.Cartographic.fromCartesian(cartesian);
    addCorridorDrawNodeEntity(
      Cesium.Math.toDegrees(carto.longitude),
      Cesium.Math.toDegrees(carto.latitude)
    );
    return;
  }

  if (corridorDrawMode === "connect") {
    if (!clickedNode) return;
    if (!corridorConnectFirstId) {
      corridorConnectFirstId = clickedNode.id;
      highlightCorridorDrawNode(clickedNode.id, true);
    } else if (corridorConnectFirstId !== clickedNode.id) {
      addCorridorDrawEdgeEntity(corridorConnectFirstId, clickedNode.id);
      highlightCorridorDrawNode(corridorConnectFirstId, false);
      corridorConnectFirstId = null;
    }
  }
}

export function setCorridorDrawNodeMode(): void {
  corridorDrawMode = "node";
  if (corridorConnectFirstId) {
    highlightCorridorDrawNode(corridorConnectFirstId, false);
    corridorConnectFirstId = null;
  }
  if (!corridorDrawHandler) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    corridorDrawHandler = handler;
    handler.setInputAction(
      (e: { position: Cesium.Cartesian2 }) => handleCorridorDrawClick(e.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }
}

export function setCorridorConnectMode(): void {
  corridorDrawMode = "connect";
  if (!corridorDrawHandler) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    corridorDrawHandler = handler;
    handler.setInputAction(
      (e: { position: Cesium.Cartesian2 }) => handleCorridorDrawClick(e.position),
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }
}

export function stopCorridorDrawTool(): void {
  corridorDrawMode = null;
  if (corridorConnectFirstId) {
    highlightCorridorDrawNode(corridorConnectFirstId, false);
    corridorConnectFirstId = null;
  }
  if (corridorDrawHandler) {
    corridorDrawHandler.destroy();
    corridorDrawHandler = null;
  }
}

export function undoCorridorDraw(): void {
  if (corridorConnectFirstId) {
    highlightCorridorDrawNode(corridorConnectFirstId, false);
    corridorConnectFirstId = null;
  }
  if (corridorDrawEdges.length > 0) {
    const edge = corridorDrawEdges.pop()!;
    viewer.entities.remove(edge.entity);
  } else if (corridorDrawNodes.length > 0) {
    const node = corridorDrawNodes.pop()!;
    for (let i = corridorDrawEdges.length - 1; i >= 0; i--) {
      if (corridorDrawEdges[i].fromId === node.id || corridorDrawEdges[i].toId === node.id) {
        viewer.entities.remove(corridorDrawEdges[i].entity);
        corridorDrawEdges.splice(i, 1);
      }
    }
    viewer.entities.remove(node.entity);
  }
  viewer.scene.requestRender();
}

export function clearCorridorDrawTool(): void {
  for (const e of corridorDrawEdges) viewer.entities.remove(e.entity);
  for (const n of corridorDrawNodes) viewer.entities.remove(n.entity);
  corridorDrawEdges = [];
  corridorDrawNodes = [];
  corridorConnectFirstId = null;
  corridorDrawNodeCounter = 0;
  viewer.scene.requestRender();
}

export function getCorridorDrawGeoJSON(): string {
  const features = corridorDrawEdges.map((edge, i) => ({
    type: "Feature",
    properties: { type: i === 0 ? "main" : "branch" },
    geometry: {
      type: "LineString",
      coordinates: [
        [edge.fromNode.lon, edge.fromNode.lat],
        [edge.toNode.lon, edge.toNode.lat],
      ],
    },
  }));
  return JSON.stringify({ type: "FeatureCollection", name: "2nd_floor_corridor", features }, null, 2);
}

function stairDebugEnabled(): boolean {
  if (stairDebugUIActive) return true;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(STAIR_DEBUG_PARAM);
  return value === "1" || value === "true" || value === "points" || value === "edit";
}

function stairDebugEditable(): boolean {
  if (stairDragUIEnabled) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get(STAIR_DEBUG_PARAM) === "edit";
}

function customStairDebugPositions(): Cesium.Cartesian3[] {
  const zLift = 0.5 + STAIR_DEBUG_HEIGHT_OFFSET;
  const total = CUSTOM_STAIR_PATH.length;
  return CUSTOM_STAIR_PATH.map((point, index) => {
    const height = stairPointHeight(index, total, ALT_2ND, ALT_3RD);
    return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, height + zLift);
  });
}

function stairDebugMarkerSvg(index: number): string {
  const label = String(index + 1);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="38" fill="#ff1f3d" stroke="#ffffff" stroke-width="8"/>
  <circle cx="48" cy="48" r="44" fill="none" stroke="#111111" stroke-width="4"/>
  <text x="48" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${label}</text>
</svg>
`)}`;
}

function exportCustomStairPath(): void {
  const lines = CUSTOM_STAIR_PATH
    .map((point) => `  { lon: ${point.lon}, lat: ${point.lat} }`)
    .join(",\n");
  console.info(`Updated CUSTOM_STAIR_PATH:\nconst CUSTOM_STAIR_PATH = [\n${lines}\n];`);
}

function updateStairDebugPoint(index: number, lon: number, lat: number): void {
  CUSTOM_STAIR_PATH[index] = { lon, lat };
  const positions = customStairDebugPositions();

  stairDebugPoints.forEach((point) => {
    point.entity.position = new Cesium.ConstantPositionProperty(positions[point.index]);
  });

  const line = viewer.entities.getById("debugCustomStairPathLine");
  if (line?.polyline) {
    line.polyline.positions = new Cesium.ConstantProperty(positions);
  }
}

function flyToStairDebugPoints(): void {
  const positions = customStairDebugPositions();
  if (positions.length === 0) return;

  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  viewer.camera.flyToBoundingSphere(sphere, {
    duration: 0.9,
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(330),
      Cesium.Math.toRadians(-55),
      22
    ),
  });
}

function installStairDebugEditor(): void {
  if (!stairDebugEditable() || stairDebugDragHandler) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  stairDebugDragHandler = handler;

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(event.position);
    const entity = picked?.id instanceof Cesium.Entity ? picked.id : null;
    const point = entity ? stairDebugPoints.get(String(entity.id)) : null;
    if (!point) return;

    selectedStairDebugPoint = point;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
    if (!selectedStairDebugPoint) return;

    const picked = pickCorridorDebugLonLat(event.endPosition);
    if (!picked) return;

    updateStairDebugPoint(selectedStairDebugPoint.index, picked.lon, picked.lat);
    viewer.scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (!selectedStairDebugPoint) return;

    selectedStairDebugPoint = null;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    exportCustomStairPath();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "s") {
      exportCustomStairPath();
    }
  });
}

export function installStairPathDebug(): void {
  if (!stairDebugEnabled() || stairDebugEntities.length > 0) return;

  const positions = customStairDebugPositions();
  const color = Cesium.Color.fromCssColorString("#FF3355");

  const line = viewer.entities.add({
    id: "debugCustomStairPathLine",
    polyline: {
      positions,
      width: 5,
      material: color.withAlpha(0.78),
      clampToGround: false,
    },
  });
  stairDebugEntities.push(line);

  positions.forEach((position, index) => {
    const pointEntity = viewer.entities.add({
      id: `debugCustomStairPathPoint-${index + 1}`,
      position,
      billboard: {
        image: stairDebugMarkerSvg(index),
        width: stairDebugEditable() ? 58 : 48,
        height: stairDebugEditable() ? 58 : 48,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      point: {
        pixelSize: stairDebugEditable() ? 38 : 30,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `${index + 1}`,
        font: "bold 20px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 5,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -34),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.58),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    stairDebugEntities.push(pointEntity);
    stairDebugPoints.set(String(pointEntity.id), { index, entity: pointEntity });
  });

  installStairDebugEditor();
  updateNavigationVisibility(currentVisibleFloor);
  flyToStairDebugPoints();
  window.setTimeout(flyToStairDebugPoints, 900);
  console.info(
    stairDebugEditable()
      ? `Stair edit debug: drag points 1-${CUSTOM_STAIR_PATH.length}. Release mouse or press S to print updated CUSTOM_STAIR_PATH.`
      : `Stair debug: showing ${CUSTOM_STAIR_PATH.length} CUSTOM_STAIR_PATH points.`
  );
  viewer.scene.requestRender();
}

// ── Stair debug UI API (called from the stair debug panel) ──────────────────

let stairAddClickHandler: Cesium.ScreenSpaceEventHandler | null = null;

export function startStairAddPointMode(onPointAdded: (index: number, lon: number, lat: number) => void): void {
  if (stairAddClickHandler) return; // already active
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  stairAddClickHandler = handler;

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    const picked = pickCorridorDebugLonLat(event.position);
    if (!picked) return;

    const index = CUSTOM_STAIR_PATH.length;
    CUSTOM_STAIR_PATH.push({ lon: picked.lon, lat: picked.lat });

    // Add a new debug entity for the new point
    const zLift = 0.5 + STAIR_DEBUG_HEIGHT_OFFSET;
    const total = CUSTOM_STAIR_PATH.length;
    const height = stairPointHeight(index, total, ALT_2ND, ALT_3RD);
    const position = Cesium.Cartesian3.fromDegrees(picked.lon, picked.lat, height + zLift);

    if (stairDebugUIActive && stairDebugEntities.length > 0) {
      const color = Cesium.Color.fromCssColorString("#FF3355");
      const pointEntity = viewer.entities.add({
        id: `debugCustomStairPathPoint-${index + 1}`,
        position,
        billboard: {
          image: stairDebugMarkerSvg(index),
          width: 58,
          height: 58,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        point: {
          pixelSize: 38,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      stairDebugEntities.push(pointEntity);
      stairDebugPoints.set(String(pointEntity.id), { index, entity: pointEntity });

      // Update polyline positions
      const allPositions = customStairDebugPositions();
      const line = viewer.entities.getById("debugCustomStairPathLine");
      if (line?.polyline) {
        line.polyline.positions = new Cesium.ConstantProperty(allPositions);
      }
    }

    viewer.scene.requestRender();
    onPointAdded(index, picked.lon, picked.lat);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

export function stopStairAddPointMode(): void {
  if (stairAddClickHandler) {
    stairAddClickHandler.destroy();
    stairAddClickHandler = null;
  }
}

export function removeLastStairPathPoint(): boolean {
  if (CUSTOM_STAIR_PATH.length === 0) return false;
  CUSTOM_STAIR_PATH.pop();

  // Remove the last debug entity
  const lastEntity = stairDebugEntities.pop();
  if (lastEntity) {
    const key = String(lastEntity.id);
    stairDebugPoints.delete(key);
    viewer.entities.remove(lastEntity);
  }

  // Update polyline
  const allPositions = customStairDebugPositions();
  const line = viewer.entities.getById("debugCustomStairPathLine");
  if (line?.polyline) {
    line.polyline.positions = new Cesium.ConstantProperty(allPositions);
  }
  viewer.scene.requestRender();
  return true;
}

export function showStairDebugUI(): void {
  stairDebugUIActive = true;
  if (stairDebugEntities.length === 0) {
    installStairPathDebug();
  } else {
    stairDebugEntities.forEach((e) => { e.show = true; });
    viewer.scene.requestRender();
  }
}

export function hideStairDebugUI(): void {
  stairDebugUIActive = false;
  stairDragUIEnabled = false;
  stairDebugEntities.forEach((e) => { e.show = false; });
  if (stairDebugDragHandler) {
    stairDebugDragHandler.destroy();
    stairDebugDragHandler = null;
  }
  viewer.scene.requestRender();
}

export function setStairDragEnabled(enabled: boolean): void {
  stairDragUIEnabled = enabled;
  if (enabled) installStairDebugEditor();
}

export function getStairPathPoints(): Array<{ lon: number; lat: number }> {
  return CUSTOM_STAIR_PATH.map((p) => ({ lon: p.lon, lat: p.lat }));
}

export function setStairPathPoint(index: number, lon: number, lat: number): void {
  if (index < 0 || index >= CUSTOM_STAIR_PATH.length) return;
  updateStairDebugPoint(index, lon, lat);
  viewer.scene.requestRender();
}

export function flyToStairDebugUI(): void {
  flyToStairDebugPoints();
}

export async function copyStairPathToClipboard(): Promise<void> {
  const lines = CUSTOM_STAIR_PATH.map((p) => `  { lon: ${p.lon}, lat: ${p.lat} }`).join(",\n");
  const text = `const CUSTOM_STAIR_PATH = [\n${lines}\n];`;
  await navigator.clipboard.writeText(text);
}

let cursorCoordHandler: Cesium.ScreenSpaceEventHandler | null = null;
let cursorCoordCard: HTMLElement | null = null;

export function showCursorCoordinateDisplay(): void {
  if (cursorCoordCard) return;

  const card = document.createElement("div");
  card.id = "cursorCoordCard";
  card.style.cssText = `
    position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.78); color:#fff; font:13px/1.5 monospace;
    padding:7px 14px; border-radius:8px; z-index:9999;
    pointer-events:none; white-space:nowrap; border:1px solid rgba(255,255,255,0.18);
  `;
  card.textContent = "Move cursor over scene…";
  document.body.appendChild(card);
  cursorCoordCard = card;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  cursorCoordHandler = handler;

  handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
    const picked = pickCorridorDebugLonLat(event.endPosition);
    if (!picked) { card.textContent = "—"; return; }

    // Also try to get scene height (model surface, not ellipsoid)
    let heightStr = "";
    try {
      const cart = viewer.scene.pickPosition(event.endPosition);
      if (cart) {
        const carto = Cesium.Cartographic.fromCartesian(cart);
        heightStr = `  H: ${Cesium.Math.toDegrees(carto.height).toFixed(3)}`;
      }
    } catch (_) { /* ignore */ }

    card.textContent = `Lat: ${picked.lat.toFixed(9)}   Lon: ${picked.lon.toFixed(9)}${heightStr}`;
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

export function hideCursorCoordinateDisplay(): void {
  if (cursorCoordHandler) { cursorCoordHandler.destroy(); cursorCoordHandler = null; }
  if (cursorCoordCard) { cursorCoordCard.remove(); cursorCoordCard = null; }
}

function intermediateDebugEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(INTERMEDIATE_DEBUG_PARAM) ?? params.get(INTERMIDIATE_DEBUG_PARAM);
  return value === "1" || value === "true" || value === "points" || value === "edit";
}

function intermediateDebugEditable(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get(INTERMEDIATE_DEBUG_PARAM) === "edit" || params.get(INTERMIDIATE_DEBUG_PARAM) === "edit";
}

function intermediateDebugAltitude(idNo: number): number {
  const landingAltitude = (ALT_2ND + ALT_3RD) / 2;
  if (idNo <= 3) return ALT_2ND + INTERMEDIATE_DEBUG_HEIGHT_OFFSET;
  if (idNo <= 5) return landingAltitude + INTERMEDIATE_DEBUG_HEIGHT_OFFSET;
  return ALT_3RD + INTERMEDIATE_DEBUG_HEIGHT_OFFSET;
}

function intermediateDebugPosition(feature: IntermediatePointFeature): Cesium.Cartesian3 {
  const coordinates = feature.geometry?.coordinates ?? [0, 0];
  const idNo = Number(feature.properties?.id_no ?? 0);
  return Cesium.Cartesian3.fromDegrees(coordinates[0], coordinates[1], intermediateDebugAltitude(idNo));
}

function intermediateDebugMarkerSvg(idNo: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="104" height="104" viewBox="0 0 104 104">
  <circle cx="52" cy="52" r="40" fill="#6d38ff" stroke="#ffffff" stroke-width="8"/>
  <circle cx="52" cy="52" r="47" fill="none" stroke="#101426" stroke-width="5"/>
  <text x="52" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#ffffff">${idNo}</text>
</svg>
`)}`;
}

function exportIntermediatePointGeoJSON(): void {
  const geoJson = {
    type: "FeatureCollection",
    name: "intermidiate_point",
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
    features: intermediateDebugFeatures,
  };
  console.info("Updated intermidiate_point.geojson", JSON.stringify(geoJson, null, 2));
}

function updateIntermediateDebugPoint(point: IntermediatePointState, lon: number, lat: number): void {
  point.feature.geometry = { type: "Point", coordinates: [lon, lat] };
  point.feature.properties = {
    ...point.feature.properties,
    long: lon,
    lat,
  };
  point.entity.position = new Cesium.ConstantPositionProperty(intermediateDebugPosition(point.feature));

  const line = viewer.entities.getById("debugIntermediatePointLine");
  if (line?.polyline) {
    const orderedPositions = intermediateDebugFeatures
      .filter((feature) => feature.geometry?.type === "Point")
      .sort((a, b) => Number(a.properties?.id_no ?? 0) - Number(b.properties?.id_no ?? 0))
      .map(intermediateDebugPosition);
    line.polyline.positions = new Cesium.ConstantProperty(orderedPositions);
  }
}

function installIntermediateDebugEditor(): void {
  if (!intermediateDebugEditable() || intermediateDebugDragHandler) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  intermediateDebugDragHandler = handler;

  handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
    const picked = viewer.scene.pick(event.position);
    const entity = picked?.id instanceof Cesium.Entity ? picked.id : null;
    const point = entity ? intermediateDebugPoints.get(String(entity.id)) : null;
    if (!point) return;

    selectedIntermediateDebugPoint = point;
    viewer.scene.screenSpaceCameraController.enableInputs = false;
  }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

  handler.setInputAction((event: { endPosition: Cesium.Cartesian2 }) => {
    if (!selectedIntermediateDebugPoint) return;

    const picked = pickCorridorDebugLonLat(event.endPosition);
    if (!picked) return;

    updateIntermediateDebugPoint(selectedIntermediateDebugPoint, picked.lon, picked.lat);
    viewer.scene.requestRender();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

  handler.setInputAction(() => {
    if (!selectedIntermediateDebugPoint) return;

    selectedIntermediateDebugPoint = null;
    viewer.scene.screenSpaceCameraController.enableInputs = true;
    exportIntermediatePointGeoJSON();
  }, Cesium.ScreenSpaceEventType.LEFT_UP);

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "i") {
      exportIntermediatePointGeoJSON();
    }
  });
}

function flyToIntermediateDebugPoints(): void {
  const positions = intermediateDebugFeatures.map(intermediateDebugPosition);
  if (positions.length === 0) return;

  viewer.camera.flyToBoundingSphere(Cesium.BoundingSphere.fromPoints(positions), {
    duration: 0.9,
    offset: new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(330),
      Cesium.Math.toRadians(-55),
      22
    ),
  });
}

export async function installIntermediatePointDebug(): Promise<void> {
  if (!intermediateDebugEnabled() || intermediateDebugEntities.length > 0) return;

  const response = await fetch(intermediatePointUrl);
  const geoJson = (await response.json()) as { features: IntermediatePointFeature[] };
  intermediateDebugFeatures = geoJson.features.filter((feature) => feature.geometry?.type === "Point");

  const orderedPositions = intermediateDebugFeatures
    .slice()
    .sort((a, b) => Number(a.properties?.id_no ?? 0) - Number(b.properties?.id_no ?? 0))
    .map(intermediateDebugPosition);

  const line = viewer.entities.add({
    id: "debugIntermediatePointLine",
    polyline: {
      positions: orderedPositions,
      width: 5,
      material: Cesium.Color.fromCssColorString("#6d38ff").withAlpha(0.78),
      clampToGround: false,
    },
  });
  intermediateDebugEntities.push(line);

  intermediateDebugFeatures.forEach((feature, index) => {
    const idNo = Number(feature.properties?.id_no ?? index + 1);
    const entity = viewer.entities.add({
      id: `debugIntermediatePoint-${idNo}`,
      position: intermediateDebugPosition(feature),
      billboard: {
        image: intermediateDebugMarkerSvg(idNo),
        width: intermediateDebugEditable() ? 60 : 50,
        height: intermediateDebugEditable() ? 60 : 50,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      point: {
        pixelSize: intermediateDebugEditable() ? 38 : 30,
        color: Cesium.Color.fromCssColorString("#6d38ff"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: `I${idNo}`,
        font: "bold 16px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(0, -38),
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.58),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });

    intermediateDebugEntities.push(entity);
    intermediateDebugPoints.set(String(entity.id), { entity, feature, index, idNo });
  });

  installIntermediateDebugEditor();
  updateNavigationVisibility(currentVisibleFloor);
  flyToIntermediateDebugPoints();
  window.setTimeout(flyToIntermediateDebugPoints, 900);
  console.info(
    intermediateDebugEditable()
      ? `Intermediate point edit debug: drag points. Release mouse or press I to print updated intermidiate_point.geojson.`
      : `Intermediate point debug: showing ${intermediateDebugFeatures.length} intermidiate_point.geojson points.`
  );
  viewer.scene.requestRender();
}

async function loadDoorGeoJSON(fileName: string, floorAltitude: number, floor: number): Promise<void> {
  const response = await fetch(geoJsonUrl(fileName));
  const json = (await response.json()) as { features: DoorFeature[] };

  for (const feature of json.features) {
    const roomName = feature.properties.room_name;
    const geometry = feature.geometry;
    let lonDeg: number;
    let latDeg: number;

    if (geometry.type === "Point") {
      [lonDeg, latDeg] = geometry.coordinates;
    } else {
      const coordinates =
        Array.isArray(geometry.coordinates[0]) && Array.isArray(geometry.coordinates[0][0])
          ? geometry.coordinates[0][0]
          : geometry.coordinates[0];
      const totals = coordinates.reduce(
        (accumulator: { lon: number; lat: number }, coordinate: [number, number]) => ({
          lon: accumulator.lon + coordinate[0],
          lat: accumulator.lat + coordinate[1]
        }),
        { lon: 0, lat: 0 }
      );
      lonDeg = totals.lon / coordinates.length;
      latDeg = totals.lat / coordinates.length;
    }

    const position = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, floorAltitude + 0.1);
    doorPositions.set(`${floor}|${roomName}`, position);
    doorPositions.set(`${floor}|${normalizeRoomName(roomName)}`, position);
  }
}

async function loadCenterlineGeoJSON(fileName: string, altitude: number): Promise<GraphNode[]> {
  const response = await fetch(geoJsonUrl(fileName));
  const geoJsonData = (await response.json()) as {
    features: Array<{
      geometry?: { type: string; coordinates: any };
      properties?: { id?: number | string; type?: string };
    }>;
  };

  const features = geoJsonData.features ?? [];
  const hasLines = features.some((f) => f.geometry?.type === "LineString");
  const hasPoints = features.some((f) => f.geometry?.type === "Point");

  // Pure LineString format
  if (hasLines && !hasPoints) {
    return buildCenterlineGraphFromLines(features, altitude);
  }

  // Build Point-based graph
  const points = features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature, index) => {
      const coordinates = feature.geometry?.coordinates ?? [0, 0];
      return { lon: coordinates[0], lat: coordinates[1], id: feature.properties?.id ?? `node-${index}` };
    });
  const graph = buildCenterlineGraph(points, altitude);

  // Hybrid: wire explicit LineString shortcuts into the Point graph
  if (hasLines) {
    let lineCounter = 0;
    for (const feature of features) {
      if (feature.geometry?.type !== "LineString") continue;
      const coords: [number, number][] = feature.geometry.coordinates;
      const lineNodes: GraphNode[] = coords.map(([lon, lat]) => ({
        pos: Cesium.Cartesian3.fromDegrees(lon, lat, altitude + 0.1),
        lon, lat,
        id: `shortcut-${lineCounter++}`,
        edges: [],
      }));

      // Connect consecutive nodes along the line explicitly
      for (let i = 0; i < lineNodes.length - 1; i++) {
        const d = Cesium.Cartesian3.distance(lineNodes[i].pos, lineNodes[i + 1].pos);
        addGraphEdge(lineNodes[i], lineNodes[i + 1], d);
      }

      // Snap first and last node to nearest existing Point graph node
      if (lineNodes.length > 0) {
        const snapFirst = nearest(graph, lineNodes[0].pos);
        addGraphEdge(lineNodes[0], snapFirst, Cesium.Cartesian3.distance(lineNodes[0].pos, snapFirst.pos));
        const snapLast = nearest(graph, lineNodes[lineNodes.length - 1].pos);
        addGraphEdge(lineNodes[lineNodes.length - 1], snapLast, Cesium.Cartesian3.distance(lineNodes[lineNodes.length - 1].pos, snapLast.pos));
      }

      graph.push(...lineNodes);
    }
  }

  return graph;
}

function buildCenterlineGraphFromLines(
  features: Array<{ geometry?: { type: string; coordinates: any }; properties?: { type?: string } }>,
  altitude: number
): GraphNode[] {
  const MAX_JUNCTION_METERS = 5.0;
  const SHARED_ENDPOINT_METERS = 0.35;
  const lineGroups: Array<{ kind: string; nodes: GraphNode[] }> = [];
  let counter = 0;

  for (const feature of features) {
    if (feature.geometry?.type !== "LineString") continue;
    const kind = (feature.properties?.type as string) ?? "main";
    const coords = feature.geometry.coordinates as Array<[number, number, number?]>;

    const nodes: GraphNode[] = coords.map(([lon, lat]) => ({
      pos: Cesium.Cartesian3.fromDegrees(lon, lat, altitude + 0.1),
      lon,
      lat,
      id: `ln-${counter++}`,
      edges: [],
    }));

    // Sequential edges within this line — guarantees the path is connected
    for (let i = 0; i < nodes.length - 1; i++) {
      addGraphEdge(nodes[i], nodes[i + 1], Cesium.Cartesian3.distance(nodes[i].pos, nodes[i + 1].pos));
    }

    lineGroups.push({ kind, nodes });
  }

  // GeoJSON corridor networks are often exported as many separate LineStrings.
  // Join shared endpoints so exact node-to-node corridors remain connected even
  // when only one short segment is marked as "main".
  for (let i = 0; i < lineGroups.length; i++) {
    for (let j = i + 1; j < lineGroups.length; j++) {
      for (const nodeA of lineGroups[i].nodes) {
        for (const nodeB of lineGroups[j].nodes) {
          const d = Cesium.Cartesian3.distance(nodeA.pos, nodeB.pos);
          if (d <= SHARED_ENDPOINT_METERS) {
            addGraphEdge(nodeA, nodeB, d);
          }
        }
      }
    }
  }

  // Connect multiple main segments to each other at the closest pair of nodes
  const mainGroups = lineGroups.filter((g) => g.kind === "main");
  for (let i = 0; i < mainGroups.length; i++) {
    for (let j = i + 1; j < mainGroups.length; j++) {
      let closestA: GraphNode | null = null;
      let closestB: GraphNode | null = null;
      let closestDist = Infinity;
      for (const nodeA of mainGroups[i].nodes) {
        for (const nodeB of mainGroups[j].nodes) {
          const d = Cesium.Cartesian3.distance(nodeA.pos, nodeB.pos);
          if (d < closestDist) { closestDist = d; closestA = nodeA; closestB = nodeB; }
        }
      }
      if (closestA && closestB && closestDist <= MAX_JUNCTION_METERS) {
        addGraphEdge(closestA, closestB, closestDist);
      }
    }
  }

  // Connect a branch to the main network only when the exported LineStrings do
  // not already reach it through shared endpoints. This keeps hand-drawn indoor
  // routes from gaining artificial shortcuts through rooms or walls.
  const mainNodes = mainGroups.flatMap((g) => g.nodes);
  const mainNodeSet = new Set(mainNodes);

  function groupReachesMain(group: { nodes: GraphNode[] }): boolean {
    const stack = [...group.nodes];
    const visited = new Set<GraphNode>();
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (visited.has(node)) continue;
      if (mainNodeSet.has(node)) return true;
      visited.add(node);
      for (const edge of node.edges) {
        stack.push(edge.node);
      }
    }
    return false;
  }

  for (const group of lineGroups) {
    if (group.kind === "main") continue;
    if (mainNodes.length === 0 || groupReachesMain(group)) continue;

    let closestBranchNode: GraphNode | null = null;
    let closestMainNode: GraphNode | null = null;
    let closestDist = Infinity;

    for (const branchNode of group.nodes) {
      for (const mainNode of mainNodes) {
        const d = Cesium.Cartesian3.distance(branchNode.pos, mainNode.pos);
        if (d < closestDist) {
          closestDist = d;
          closestBranchNode = branchNode;
          closestMainNode = mainNode;
        }
      }
    }

    if (closestBranchNode && closestMainNode && closestDist <= MAX_JUNCTION_METERS) {
      addGraphEdge(closestBranchNode, closestMainNode, closestDist);
    }
  }

  return lineGroups.flatMap((g) => g.nodes);
}

function buildCenterlineGraph(points: Array<{ lon: number; lat: number; id: number | string }>, altitude: number): GraphNode[] {
  const graph: GraphNode[] = points.map((point) => ({
    pos: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, altitude + 0.1),
    lon: point.lon,
    lat: point.lat,
    id: point.id,
    edges: []
  }));

  rebuildCenterlineGraphEdges(graph);
  return graph;
}

function rebuildCenterlineGraphEdges(graph: GraphNode[]): void {
  graph.forEach((node) => {
    node.edges = [];
  });

  for (let i = 0; i < graph.length; i += 1) {
    const nearestNodes = graph
      .map((node, index) => ({
        node,
        index,
        distance: Cesium.Cartesian3.distance(graph[i].pos, node.pos)
      }))
      .filter((candidate) => candidate.index !== i && candidate.distance <= MAX_CORRIDOR_EDGE_METERS)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_CORRIDOR_NEAREST_NEIGHBORS);

    nearestNodes.forEach((candidate) => {
      addGraphEdge(graph[i], candidate.node, candidate.distance);
    });
  }
}

function addGraphEdge(from: GraphNode, to: GraphNode, distance: number): void {
  if (!from.edges.some((edge) => edge.node === to)) {
    from.edges.push({ node: to, w: distance });
  }

  if (!to.edges.some((edge) => edge.node === from)) {
    to.edges.push({ node: from, w: distance });
  }
}

function findPath(graph: GraphNode[], start: GraphNode, goal: GraphNode): Cesium.Cartesian3[] | null {
  const unvisited = new Set(graph);
  const previous = new Map<GraphNode, GraphNode>();
  const distanceByNode = new Map<GraphNode, number>();

  graph.forEach((node) => distanceByNode.set(node, Number.POSITIVE_INFINITY));
  distanceByNode.set(start, 0);

  while (unvisited.size > 0) {
    let selectedNode: GraphNode | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const node of unvisited) {
      const nodeDistance = distanceByNode.get(node) ?? Number.POSITIVE_INFINITY;
      if (nodeDistance < currentDistance) {
        selectedNode = node;
        currentDistance = nodeDistance;
      }
    }

    if (!selectedNode || currentDistance === Number.POSITIVE_INFINITY) break;
    const current = selectedNode;
    if (current === goal) break;

    unvisited.delete(current);

    for (const edge of current.edges) {
      if (!unvisited.has(edge.node)) continue;

      const nextDistance = currentDistance + edge.w + HOP_PENALTY_METERS;
      if (nextDistance < (distanceByNode.get(edge.node) ?? Number.POSITIVE_INFINITY)) {
        distanceByNode.set(edge.node, nextDistance);
        previous.set(edge.node, current);
      }
    }
  }

  if (start !== goal && !previous.has(goal)) return null;

  const path: Cesium.Cartesian3[] = [];
  let node: GraphNode | undefined = goal;
  while (node) {
    path.unshift(node.pos);
    node = previous.get(node);
  }

  return path;
}

function nearest(graph: GraphNode[], position: Cesium.Cartesian3): GraphNode {
  let best = graph[0];
  let bestDistance = Infinity;

  for (const node of graph) {
    const distance = Cesium.Cartesian3.distance(node.pos, position);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
}


function headingENU(start: Cesium.Cartesian3, end: Cesium.Cartesian3): number {
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(start);
  const inverse = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
  const localStart = Cesium.Matrix4.multiplyByPoint(inverse, start, new Cesium.Cartesian3());
  const localEnd = Cesium.Matrix4.multiplyByPoint(inverse, end, new Cesium.Cartesian3());
  return Math.atan2(localEnd.y - localStart.y, localEnd.x - localStart.x);
}

function ptToSegDist(p: Cesium.Cartesian3, a: Cesium.Cartesian3, b: Cesium.Cartesian3): number {
  const ab = Cesium.Cartesian3.subtract(b, a, new Cesium.Cartesian3());
  const len2 = Cesium.Cartesian3.dot(ab, ab);
  if (len2 < 1e-10) return Cesium.Cartesian3.distance(p, a);
  const ap = Cesium.Cartesian3.subtract(p, a, new Cesium.Cartesian3());
  const t = Math.max(0, Math.min(1, Cesium.Cartesian3.dot(ap, ab) / len2));
  const proj = Cesium.Cartesian3.add(a, Cesium.Cartesian3.multiplyByScalar(ab, t, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  return Cesium.Cartesian3.distance(p, proj);
}

function rdpSimplify(points: Cesium.Cartesian3[], tol: number): Cesium.Cartesian3[] {
  if (points.length <= 2) return [...points];
  let maxD = 0, maxI = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = ptToSegDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > tol) {
    return [
      ...rdpSimplify(points.slice(0, maxI + 1), tol).slice(0, -1),
      ...rdpSimplify(points.slice(maxI), tol),
    ];
  }
  return [points[0], points[points.length - 1]];
}

function quadBezierPt(p0: Cesium.Cartesian3, p1: Cesium.Cartesian3, p2: Cesium.Cartesian3, t: number): Cesium.Cartesian3 {
  const mt = 1 - t;
  return new Cesium.Cartesian3(
    mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
    mt * mt * p0.z + 2 * mt * t * p1.z + t * t * p2.z
  );
}

function smoothCorners(points: Cesium.Cartesian3[], radius: number, segs = 6): Cesium.Cartesian3[] {
  if (points.length <= 2) return points;
  const out: Cesium.Cartesian3[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const d1 = Cesium.Cartesian3.distance(prev, curr);
    const d2 = Cesium.Cartesian3.distance(curr, next);
    const r = Math.min(radius, d1 * 0.45, d2 * 0.45);
    const p1 = Cesium.Cartesian3.lerp(curr, prev, r / d1, new Cesium.Cartesian3());
    const p2 = Cesium.Cartesian3.lerp(curr, next, r / d2, new Cesium.Cartesian3());
    for (let s = 0; s <= segs; s++) {
      out.push(quadBezierPt(p1, curr, p2, s / segs));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function samplePathByDistance(path: Cesium.Cartesian3[], spacingMeters = 1.2): Cesium.Cartesian3[] {
  if (path.length < 2) return path;

  const sampled: Cesium.Cartesian3[] = [path[0]];
  let carry = 0;

  for (let i = 1; i < path.length; i += 1) {
    const start = path[i - 1];
    const end = path[i];
    const segmentLength = Cesium.Cartesian3.distance(start, end);
    if (segmentLength < 0.001) continue;

    if (isCustomStairSegment(start, end)) {
      sampled.push(end);
      carry = 0;
      continue;
    }

    let distance = spacingMeters - carry;

    while (distance < segmentLength) {
      const t = distance / segmentLength;
      sampled.push(Cesium.Cartesian3.lerp(start, end, t, new Cesium.Cartesian3()));
      distance += spacingMeters;
    }

    carry = segmentLength - (distance - spacingMeters);
  }

  if (Cesium.Cartesian3.distance(sampled[sampled.length - 1], path[path.length - 1]) > 0.001) {
    sampled.push(path[path.length - 1]);
  }
  return sampled;
}

function horizontalDistanceMeters(a: Cesium.Cartesian3, b: Cesium.Cartesian3): number {
  const aCarto = Cesium.Cartographic.fromCartesian(a);
  const bCarto = Cesium.Cartographic.fromCartesian(b);
  const aGround = Cesium.Cartesian3.fromRadians(aCarto.longitude, aCarto.latitude, 0);
  const bGround = Cesium.Cartesian3.fromRadians(bCarto.longitude, bCarto.latitude, 0);
  return Cesium.Cartesian3.distance(aGround, bGround);
}

function isNearCustomStairPath(position: Cesium.Cartesian3, toleranceMeters = 0.45): boolean {
  return CUSTOM_STAIR_PATH.some((point) => {
    const stairPoint = Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0);
    return horizontalDistanceMeters(position, stairPoint) <= toleranceMeters;
  });
}

function isCustomStairSegment(start: Cesium.Cartesian3, end: Cesium.Cartesian3): boolean {
  return isNearCustomStairPath(start) && isNearCustomStairPath(end);
}

function addGlowBillboards(
  collection: Cesium.BillboardCollection,
  count = 3
): Cesium.Billboard[] {
  const glows: Cesium.Billboard[] = [];
  for (let i = 0; i < count; i += 1) {
    glows.push(collection.add({
      position: Cesium.Cartesian3.ZERO,
      image: ROUTE_GLOW_SVG,
      scale: 0.38,
      color: Cesium.Color.WHITE.withAlpha(0.9),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: false,
    }));
  }
  return glows;
}

function buildRouteLine(
  lineCollection: Cesium.PolylineCollection,
  nodeCollection: Cesium.PointPrimitiveCollection,
  _labelCollection: Cesium.LabelCollection,
  path: Cesium.Cartesian3[]
): { flowMat: Cesium.Material; sampledPoints: Cesium.Cartesian3[] } {
  // Simplify redundant collinear points, then add gentle bezier curves at turns
  const simplified = rdpSimplify(path, 0.30);
  const drawPath = smoothCorners(simplified, 0.50, 8);

  // Dashed white line  (- - - - style)
  const dashMat = Cesium.Material.fromType("PolylineDash", {
    color: Cesium.Color.fromCssColorString("#FFFFFF").withAlpha(0.92),
    gapColor: Cesium.Color.fromCssColorString("#000000").withAlpha(0.0),
    dashLength: 10.0,
    dashPattern: 0xF0F0,   // alternating 4-on / 4-off
    dashOffset: 0.0,
  });
  lineCollection.add({ positions: drawPath, width: 5, material: dashMat });

  // Animated highlight layer that flows along the dashes
  const flowMat = Cesium.Material.fromType("PolylineDash", {
    color: Cesium.Color.fromCssColorString("#F5A623").withAlpha(0.7),
    gapColor: Cesium.Color.TRANSPARENT,
    dashLength: 10.0,
    dashPattern: 0xF0F0,
    dashOffset: 0.0,
  });
  lineCollection.add({ positions: drawPath, width: 3, material: flowMat });

  // Orange dots every 1 m along the smoothed path
  const dotPositions = samplePathByDistance(drawPath, 1.0);
  dotPositions.forEach((pos) => {
    nodeCollection.add({
      position: pos,
      pixelSize: 12,
      color: Cesium.Color.fromCssColorString("#F5A623"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  });

  // Orb animation uses a finer sample of the smoothed path
  const sampledPoints = samplePathByDistance(drawPath, 0.5);
  return { flowMat, sampledPoints };
}

function startRouteAnimation(): void {
  if (routeAnimRemove !== null) {
    routeAnimRemove();
    routeAnimRemove = null;
  }

  routeGlowCollectionA.removeAll();
  routeGlowCollectionB.removeAll();

  const glowsA = addGlowBillboards(routeGlowCollectionA, 3);
  const glowsB = addGlowBillboards(routeGlowCollectionB, 3);

  routeAnimStart = performance.now();

  const ORBS_SPEED = 0.6;  // path traversals per second

  routeAnimRemove = viewer.scene.postRender.addEventListener(() => {
    const elapsed = (performance.now() - routeAnimStart) * 0.001;
    const flowOffset = (elapsed * 1.1) % 1.0;

    // Animate dash flow
    if (routeFlowMatA) routeFlowMatA.uniforms["dashOffset"] = flowOffset;
    if (routeFlowMatB) routeFlowMatB.uniforms["dashOffset"] = flowOffset;

    // Move glow orbs along path (orange-white pulse to match node dot style)
    const updateGlows = (points: Cesium.Cartesian3[], glows: Cesium.Billboard[]) => {
      if (points.length === 0) { glows.forEach((g) => { g.show = false; }); return; }
      glows.forEach((glow, i) => {
        const t = (elapsed * ORBS_SPEED + i / glows.length) % 1;
        const idx = Math.min(Math.floor(t * points.length), points.length - 1);
        glow.position = points[idx];
        glow.show = true;
        glow.scale = 0.22 + 0.10 * Math.sin(elapsed * 5 + i * 2.1);
        glow.color = Cesium.Color.fromCssColorString("#FFCC44").withAlpha(
          0.80 + 0.18 * Math.sin(elapsed * 3.5 + i * 1.5)
        );
      });
    };

    updateGlows(routePathPointsA, glowsA);
    updateGlows(routePathPointsB, glowsB);

    viewer.scene.requestRender();
  });
}

function generateTurnSteps(path: Cesium.Cartesian3[]): Array<{ icon: string; title: string; primary: string; startDist: number }> {
  if (path.length < 2) return [];
  const steps: Array<{ icon: string; title: string; primary: string; startDist: number }> = [];

  let currentHeading = headingENU(path[0], path[1]);
  let accumulatedDistance = Cesium.Cartesian3.distance(path[0], path[1]);
  let absoluteDist = accumulatedDistance;

  steps.push({
    icon: "↑",
    title: "Start",
    primary: "Go forward",
    startDist: 0
  });

  for (let i = 1; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const distance = Cesium.Cartesian3.distance(p1, p2);
    if (distance < 0.8) {
      accumulatedDistance += distance;
      absoluteDist += distance;
      continue;
    }

    const nextHeading = headingENU(p1, p2);
    let angleDiff = nextHeading - currentHeading;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    if (Math.abs(angleDiff) > 0.45) {
      steps[steps.length - 1].primary += ` for ${Math.max(1, Math.round(accumulatedDistance))} m`;

      const turnDir = angleDiff > 0 ? "left" : "right";
      steps.push({
        icon: angleDiff > 0 ? "↰" : "↱",
        title: `Turn ${turnDir}`,
        primary: `Turn ${turnDir} and go ahead`,
        startDist: absoluteDist
      });

      currentHeading = nextHeading;
      accumulatedDistance = distance;
    } else {
      accumulatedDistance += distance;
    }
    absoluteDist += distance;
  }

  steps[steps.length - 1].primary += ` for ${Math.max(1, Math.round(accumulatedDistance))} m`;
  return steps;
}

function drawRoute(pathA: Cesium.Cartesian3[], pathB: Cesium.Cartesian3[]): void {
  clearRouteEntities();

  if (pathA.length > 1) {
    const { flowMat, sampledPoints } = buildRouteLine(routeTrackCollectionA, routeNodeCollectionA, routeLabelCollectionA, pathA);
    routeFlowMatA = flowMat;
    routePathPointsA = sampledPoints;
  }

  if (pathB.length > 1) {
    const { flowMat, sampledPoints } = buildRouteLine(routeTrackCollectionB, routeNodeCollectionB, routeLabelCollectionB, pathB);
    routeFlowMatB = flowMat;
    routePathPointsB = sampledPoints;
  }

  // Stair segment intentionally not drawn — no corridor nodes connect those points

  const path = pathA.length > 0 ? pathA : pathB;
  if (path.length === 0) return;

  const start = path[0];
  const end = pathB.length > 0 ? pathB[pathB.length - 1] : pathA[pathA.length - 1];

  viewer.entities.add({
    id: "startMarker",
    position: start,
    point: {
      pixelSize: 28,
      color: Cesium.Color.fromCssColorString("#0055FF"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 6,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  viewer.entities.add({
    id: "endMarker",
    position: end,
    point: {
      pixelSize: new Cesium.CallbackProperty(() => 24 + 6 * Math.abs(Math.sin(performance.now() * 0.004)), false),
      color: Cesium.Color.fromCssColorString("#FF2200"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 6,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  startRouteAnimation();
  updateNavigationVisibility(currentVisibleFloor);
  setRoutePreviewAvailable(true);
  viewer.scene.requestRender();
}

async function ensureNavData(): Promise<void> {
  if (navDataReady) return;

  const [graph2, graph3] = await Promise.all([
    centerlineGraph2 ? Promise.resolve(centerlineGraph2) : loadCenterlineGeoJSON("2nd_floor_corridor.geojson", ALT_2ND),
    centerlineGraph3 ? Promise.resolve(centerlineGraph3) : loadCenterlineGeoJSON("3rd_floor_corridor.geojson", ALT_3RD)
  ]);
  centerlineGraph2 = graph2;
  centerlineGraph3 = graph3;

  if (doorPositions.size === 0) {
    await Promise.all([loadDoorGeoJSON("door_2nd.geojson", ALT_2ND, 3), loadDoorGeoJSON("door_3rd.geojson", ALT_3RD, 4)]);
  }

  navDataReady = true;
}

function getSelectValue(id: string): string {
  const element = document.getElementById(id) as HTMLSelectElement | null;
  return element?.value ?? "";
}

function getEntityRoomName(entity: Cesium.Entity): string | undefined {
  const value = (entity.properties as any)?.room_name;
  return typeof value?.getValue === "function" ? value.getValue() : undefined;
}

function parseFloorAwareRoomLabel(value: string): { roomName: string; floor: number | null } {
  const match = value.match(/^(.*)\s+\((2nd|3rd) Floor\)$/);
  if (!match) return { roomName: value, floor: null };

  return {
    roomName: match[1],
    floor: match[2] === "2nd" ? 3 : 4,
  };
}

function roomExistsOnFloor(roomName: string, floor: number): boolean {
  const dataSource = floor === 3 ? geo2 : geo3;
  const target = normalizeRoomName(roomName);
  return Boolean(dataSource?.entities.values.some((entity) => normalizeRoomName(getEntityRoomName(entity)) === target));
}

// Matches "[Person] Name" or "[Person] Name (2nd Floor)" / "[Person] Name (3rd Floor)"
const PERSON_LABEL_RE = /^\[Person\]\s+(.+?)(?:\s+\((2nd|3rd) Floor\))?$/;

function resolveRoomSelection(value: string): ResolvedRoomSelection | null {
  if (!value) return null;

  // Handle person / chair selections
  const personMatch = value.match(PERSON_LABEL_RE);
  if (personMatch) {
    const personName = personMatch[1];
    const floorLabel = personMatch[2];
    const floor = floorLabel === "2nd" ? 3 : floorLabel === "3rd" ? 4 : null;
    const point = chairNavPoints.find(
      (p) => p.name === personName && (floor === null || p.floor === floor)
    );
    if (!point) return null;
    return {
      displayName: personName,
      roomName: `person:${point.name}:${point.floor}`,
      floor: point.floor,
    };
  }

  const parsed = parseFloorAwareRoomLabel(value);
  const floor = parsed.floor ?? (roomExistsOnFloor(parsed.roomName, 3) ? 3 : roomExistsOnFloor(parsed.roomName, 4) ? 4 : null);
  if (!floor) return null;

  return {
    displayName: value,
    roomName: parsed.roomName,
    floor,
  };
}

function getRoomFallbackPosition(roomName: string, floor: number): Cesium.Cartesian3 | undefined {
  const dataSource = floor === 3 ? geo2 : geo3;
  const target = normalizeRoomName(roomName);
  const entity = dataSource?.entities.values.find((candidate) => normalizeRoomName(getEntityRoomName(candidate)) === target);
  if (!entity) return undefined;

  const altitude = floor === 3 ? ALT_2ND : ALT_3RD;
  const position = entity.position?.getValue(Cesium.JulianDate.now());
  if (position) {
    const carto = Cesium.Cartographic.fromCartesian(position);
    return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, altitude + 0.1);
  }

  const hierarchy = entity.polygon?.hierarchy?.getValue(Cesium.JulianDate.now());
  const positions = hierarchy?.positions ?? [];
  if (positions.length === 0) return undefined;

  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const cartographic = Cesium.Cartographic.fromCartesian(sphere.center);
  return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude + 0.1);
}

function getDoorPosition(roomName: string, floor: number): Cesium.Cartesian3 | undefined {
  // Person / chair destination — use the actual GLB model position when available
  if (roomName.startsWith("person:")) {
    const [, name, floorStr] = roomName.split(":");
    const personFloor = Number(floorStr) as 3 | 4;
    const altitude = personFloor === 3 ? ALT_2ND : ALT_3RD;
    // Primary: real position extracted from model bounding sphere after render
    const actual = getActualChairPosition(name, personFloor);
    if (actual) {
      return Cesium.Cartesian3.fromDegrees(actual.lon, actual.lat, altitude);
    }
    // Fallback: static corridor node coordinate
    const pt = chairNavPoints.find((p) => p.name === name && p.floor === personFloor);
    if (pt) {
      return Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, altitude);
    }
    return undefined;
  }

  if (floor === 3 && normalizeRoomName(roomName) === "pantry") {
    return SECOND_FLOOR_PANTRY_EMPLOYEE_SIDE_DOOR;
  }

  return doorPositions.get(`${floor}|${roomName}`)
    ?? doorPositions.get(`${floor}|${normalizeRoomName(roomName)}`)
    ?? getRoomFallbackPosition(roomName, floor);
}

function shouldUseFirstThirdFloorPantryDoor(otherSelection: ResolvedRoomSelection): boolean {
  // Cross-floor routes enter/exit Pantry through the first door.
  // Same-floor 3rd-floor routes use Pantry's second door.
  return otherSelection.floor !== 4;
}

function getRouteDoorPosition(
  selection: ResolvedRoomSelection,
  otherSelection: ResolvedRoomSelection
): Cesium.Cartesian3 | undefined {
  if (selection.floor === 4 && normalizeRoomName(selection.roomName) === "pantry") {
    return shouldUseFirstThirdFloorPantryDoor(otherSelection)
      ? THIRD_FLOOR_PANTRY_NEAR_CONFERENCE_DOOR
      : THIRD_FLOOR_PANTRY_LOWER_DOOR;
  }

  if (selection.floor === 4 && normalizeRoomName(selection.roomName) === "library") {
    return THIRD_FLOOR_LIBRARY_POSITION;
  }

  return getDoorPosition(selection.roomName, selection.floor);
}

function graphForFloor(floor: number): GraphNode[] | null {
  return floor === 3 ? centerlineGraph2 : centerlineGraph3;
}

function floorLabel(floor: number): string {
  return floor === 3 ? "2nd Floor" : floor === 4 ? "3rd Floor" : `Floor ${floor}`;
}

function pathDistance(paths: Cesium.Cartesian3[][]): number {
  let total = 0;
  for (const path of paths) {
    for (let index = 1; index < path.length; index += 1) {
      total += Cesium.Cartesian3.distance(path[index - 1], path[index]);
    }
  }
  return total;
}

export async function startNavigation(): Promise<void> {
  clearRoomPreviewEffect();
  if (!geo2 || !geo3) {
    setNavigationMessage("Room data is still loading.");
    return;
  }

  await ensureNavData();

  const fromName = getSelectValue("fromRoom");
  const toName = getSelectValue("toRoom");
  const fromSelection = resolveRoomSelection(fromName);
  const toSelection = resolveRoomSelection(toName);

  // For person destinations: load their floor's chair models and extract actual seat positions
  for (const sel of [fromSelection, toSelection]) {
    if (sel && sel.roomName.startsWith("person:")) {
      const personFloor = sel.floor as 3 | 4;
      await loadChairsForFloor(personFloor);
      viewer.scene.render(); // force Cesium to compute world-space bounding spheres
      extractAndCacheChairPositions(personFloor);
    }
  }
  if (!fromSelection || !toSelection) {
    setNavigationMessage("Choose a start and destination.");
    return;
  }

  activeDestinationPerson = toSelection.roomName.startsWith("person:")
    ? { name: toSelection.roomName.split(":")[1], floor: toSelection.floor as 3 | 4 }
    : null;

  const fromFloor = fromSelection.floor;
  const toFloor = toSelection.floor;
  const graphA = graphForFloor(fromFloor);
  const graphB = graphForFloor(toFloor);
  const startDoorPosition = getRouteDoorPosition(fromSelection, toSelection);
  const endDoorPosition = getRouteDoorPosition(toSelection, fromSelection);

  if (!graphA || !graphB || !startDoorPosition || !endDoorPosition) {
    setNavigationMessage("No route data for the selected rooms.");
    return;
  }

  const zLift = 0.5;
  let pathFloorA: Cesium.Cartesian3[] = [];
  let pathFloorB: Cesium.Cartesian3[] = [];

  activeStairClimbPath = [];
  if (fromFloor === toFloor) {
    const path = findPath(graphA, nearest(graphA, startDoorPosition), nearest(graphA, endDoorPosition));
    if (!path) {
      setNavigationMessage("No route found.");
      return;
    }
    const corridorPoints = [startDoorPosition, ...path, endDoorPosition];
    if (fromSelection.floor === 4 && normalizeRoomName(fromSelection.roomName) === "conference room") {
      corridorPoints.unshift(THIRD_FLOOR_CONFERENCE_ROOM_INSIDE);
    }
    if (toSelection.floor === 4 && normalizeRoomName(toSelection.roomName) === "conference room") {
      corridorPoints.push(THIRD_FLOOR_CONFERENCE_ROOM_INSIDE);
    }
    pathFloorA = corridorPoints.map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );
  } else {
    const startAltitude = fromFloor === 3 ? ALT_2ND : ALT_3RD;
    const targetAltitude = fromFloor === 3 ? ALT_3RD : ALT_2ND;
    const secondFloorStairPoint = CUSTOM_STAIR_PATH[0];
    const thirdFloorStairPoint = CUSTOM_STAIR_PATH[CUSTOM_STAIR_PATH.length - 1];
    const stairEntrySource = fromFloor === 3 ? secondFloorStairPoint : thirdFloorStairPoint;
    const stairExitSource = toFloor === 3 ? secondFloorStairPoint : thirdFloorStairPoint;
    const stairEntryPoint = Cesium.Cartesian3.fromDegrees(
      stairEntrySource.lon,
      stairEntrySource.lat,
      startAltitude + zLift
    );
    const stairExitPoint = Cesium.Cartesian3.fromDegrees(
      stairExitSource.lon,
      stairExitSource.lat,
      targetAltitude + zLift
    );

    const part1 = findPath(graphA, nearest(graphA, startDoorPosition), nearest(graphA, stairEntryPoint));
    const part2 = findPath(graphB, nearest(graphB, stairExitPoint), nearest(graphB, endDoorPosition));
    if (!part1 || !part2) {
      setNavigationMessage("No route found.");
      return;
    }

    // Build stair climb positions — all CUSTOM_STAIR_PATH points with interpolated heights.
    // Going 2nd→3rd: ascending order; 3rd→2nd: reversed (descending).
    const stairOrderedPath = fromFloor === 3
      ? CUSTOM_STAIR_PATH
      : [...CUSTOM_STAIR_PATH].reverse();
    const stairClimbPositions = stairOrderedPath.map((pt, i) => {
      const h = stairPointHeight(i, stairOrderedPath.length, startAltitude, targetAltitude);
      return Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, h + zLift);
    });

    // "From" floor path: corridor portion only (no stair positions — stair drawn separately)
    const corridorToStair = [startDoorPosition, ...part1];
    if (fromSelection.floor === 4 && normalizeRoomName(fromSelection.roomName) === "conference room") {
      corridorToStair.unshift(THIRD_FLOOR_CONFERENCE_ROOM_INSIDE);
    }
    while (
      corridorToStair.length > 1 &&
      horizontalDistanceMeters(corridorToStair[corridorToStair.length - 1], stairClimbPositions[0]) < 0.5
    ) {
      corridorToStair.pop();
    }
    pathFloorA = corridorToStair.map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );

    // "To" floor path: corridor portion only (stair exit node not included)
    const corridorFromStair = [...part2, endDoorPosition];
    if (toSelection.floor === 4 && normalizeRoomName(toSelection.roomName) === "conference room") {
      corridorFromStair.push(THIRD_FLOOR_CONFERENCE_ROOM_INSIDE);
    }
    pathFloorB = corridorFromStair.map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );

    activeStairClimbPath = stairClimbPositions;
  }

  activeNavFromFloor = fromFloor;
  activeNavToFloor = toFloor;
  setNavigationAllowedFloors([...new Set([fromFloor, toFloor])]);
  liveNavFloorSwitchDistance = null;
  liveNavFloorSwitchTarget = null;
  liveNavFloorSwitchDone = false;
  liveNavFloorBreakIndex = null;
  if (fromFloor !== toFloor && pathFloorA.length > 0 && pathFloorB.length > 0) {
    // Floor switch happens after the full corridor + stair climb
    liveNavFloorSwitchDistance = pathDistance([pathFloorA]) + pathDistance([activeStairClimbPath]);
    liveNavFloorSwitchTarget = toFloor;
    liveNavFloorBreakIndex = pathFloorA.length - 1 + activeStairClimbPath.length;
  }

  // If navigation crosses floors, show loading spinner and ensure both floor models are loaded
  if (fromFloor !== toFloor) {
    showFloorSpinner("Preparing navigation…");
    try {
      await Promise.all([ensureFloorModelLoaded(fromFloor), ensureFloorModelLoaded(toFloor)]);
    } catch (err) {
      console.warn("Failed to preload floor models for navigation:", err);
    } finally {
      hideFloorSpinner();
    }
  }

  await Promise.resolve(navigationFloorSwitchHandler?.(fromFloor));

  drawRoute(pathFloorA, pathFloorB);
  const fullPath = [...pathFloorA, ...activeStairClimbPath, ...pathFloorB];
  const totalDistance = Math.round(pathDistance([pathFloorA, pathFloorB]));

  // Generate turn-by-turn steps for the View Directions panel
  const allSteps: any[] = [];
  let baseDistOffset = 0;

  if (pathFloorA.length > 0) {
    allSteps.push(...generateTurnSteps(pathFloorA));
    baseDistOffset = pathDistance([pathFloorA]);
  }
  if (fromFloor !== toFloor) {
    const stairDirection = fromFloor < toFloor ? "Go upstairs" : "Go downstairs";
    allSteps.push({ icon: "🪜", title: "Use stairs", primary: `${stairDirection}, then switch to ${floorLabel(toFloor)}`, startDist: baseDistOffset });
    if (pathFloorB.length > 0) {
      const stepsB = generateTurnSteps(pathFloorB);
      allSteps.push(...stepsB.map((s) => ({ ...s, startDist: s.startDist + baseDistOffset })));
      baseDistOffset += pathDistance([pathFloorB]);
    }
  }
  allSteps.push({ icon: "🚩", title: "Arrive at destination", text: `You have reached ${toSelection.displayName}`, startDist: baseDistOffset });

  updateNavigationUI({
    fromName: fromSelection.displayName,
    toName: toSelection.displayName,
    totalDistance,
    totalTime: Math.max(1, Math.round(totalDistance / 80)),
    list: allSteps
  });

  // Store path and steps so Preview Route can fly through and highlight directions
  liveNavPath = fullPath;
  liveNavSteps = allSteps.map((s: { startDist: number }) => ({ startDist: s.startDist }));
  liveNavIndex = 0;

  setNavigationMessage("Route drawn. Press Preview Route to walk through it.", false);

  // Fly camera to show an overview of the full route
  if (fullPath.length >= 2) {
    const routeSphere = Cesium.BoundingSphere.fromPoints(fullPath);
    const expandedRadius = Math.max(routeSphere.radius * 2.5, 15);
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(routeSphere.center, expandedRadius),
      {
        duration: 1.2,
        offset: new Cesium.HeadingPitchRange(
          viewer.camera.heading,
          Cesium.Math.toRadians(-55),
          expandedRadius * 2
        )
      }
    );
  } else {
    viewer.scene.requestRender();
  }
}

export function getActiveNavigationStartFloor(): number | null {
  return activeNavFromFloor;
}

export function getActiveNavigationEndFloor(): number | null {
  return activeNavToFloor;
}

// ── Chair seat view presets (persisted in localStorage) ─────────────────────

const CHAIR_PRESET_KEY = "cesium_chair_view_presets";

type ChairViewPreset = {
  lon: number; lat: number; height: number;
  heading: number; pitch: number; roll: number; fov: number;
};

function readChairViewPresets(): Record<string, ChairViewPreset> {
  try {
    return JSON.parse(localStorage.getItem(CHAIR_PRESET_KEY) ?? "{}") as Record<string, ChairViewPreset>;
  } catch {
    return {};
  }
}

export function getChairViewPreset(name: string, floor: 3 | 4): ChairViewPreset | null {
  return readChairViewPresets()[`${floor}|${name}`] ?? null;
}

export function saveCurrentCameraAsChairPreset(name: string, floor: 3 | 4): void {
  const cam = viewer.camera;
  const pos = Cesium.Cartographic.fromCartesian(cam.position);
  const presets = readChairViewPresets();
  presets[`${floor}|${name}`] = {
    lon: Number(Cesium.Math.toDegrees(pos.longitude).toFixed(9)),
    lat: Number(Cesium.Math.toDegrees(pos.latitude).toFixed(9)),
    height: Number(pos.height.toFixed(4)),
    heading: Number(Cesium.Math.toDegrees(cam.heading).toFixed(4)),
    pitch: Number(Cesium.Math.toDegrees(cam.pitch).toFixed(4)),
    roll: Number(Cesium.Math.toDegrees(cam.roll).toFixed(4)),
    fov: cam.frustum instanceof Cesium.PerspectiveFrustum
      ? Number(Cesium.Math.toDegrees(cam.frustum.fov ?? Cesium.Math.toRadians(58)).toFixed(2))
      : 58,
  };
  localStorage.setItem(CHAIR_PRESET_KEY, JSON.stringify(presets));
}

export function deleteChairViewPreset(name: string, floor: 3 | 4): void {
  const presets = readChairViewPresets();
  delete presets[`${floor}|${name}`];
  localStorage.setItem(CHAIR_PRESET_KEY, JSON.stringify(presets));
}

export function getAllChairViewPresets(): Record<string, ChairViewPreset> {
  return readChairViewPresets();
}

export function flyToChairViewPreset(name: string, floor: 3 | 4): boolean {
  const preset = getChairViewPreset(name, floor);
  if (!preset) return false;
  if (typeof (viewer.camera as any).cancelFlight === "function") {
    (viewer.camera as any).cancelFlight();
  }
  if (viewer.camera.frustum instanceof Cesium.PerspectiveFrustum) {
    viewer.camera.frustum.fov = Cesium.Math.toRadians(preset.fov);
  }
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(preset.lon, preset.lat, preset.height),
    orientation: {
      heading: Cesium.Math.toRadians(preset.heading),
      pitch: Cesium.Math.toRadians(preset.pitch),
      roll: Cesium.Math.toRadians(preset.roll),
    },
    duration: 1.0,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  });
  return true;
}

export function getChairViewPresetsCode(): string {
  const presets = readChairViewPresets();
  const entries = Object.entries(presets).map(([k, v]) =>
    `  "${k}": { lon: ${v.lon}, lat: ${v.lat}, height: ${v.height}, heading: ${v.heading}, pitch: ${v.pitch}, roll: ${v.roll}, fov: ${v.fov} }`
  );
  return entries.length === 0
    ? "// No chair view presets saved yet."
    : `const CHAIR_VIEW_PRESETS = {\n${entries.join(",\n")}\n};`;
}

// ── Floor arrival view override (saved by the UI debug card) ─────────────────

const FLOOR_ARRIVAL_OVERRIDE_KEY = "cesium_floor_arrival_override";

export type FloorArrivalPreset = {
  lon: number; lat: number; height: number;
  heading: number; pitch: number; roll: number;
};

function readFloorArrivalOverrides(): Record<number, FloorArrivalPreset> {
  try {
    return JSON.parse(localStorage.getItem(FLOOR_ARRIVAL_OVERRIDE_KEY) ?? "{}") as Record<number, FloorArrivalPreset>;
  } catch {
    return {};
  }
}

export function getFloorArrivalOverride(floor: 3 | 4): FloorArrivalPreset | null {
  return readFloorArrivalOverrides()[floor] ?? null;
}

export function saveFloorArrivalOverride(floor: 3 | 4, preset: FloorArrivalPreset): void {
  const all = readFloorArrivalOverrides();
  all[floor] = preset;
  localStorage.setItem(FLOOR_ARRIVAL_OVERRIDE_KEY, JSON.stringify(all));
}

export function clearFloorArrivalOverride(floor: 3 | 4): void {
  const all = readFloorArrivalOverrides();
  delete all[floor];
  localStorage.setItem(FLOOR_ARRIVAL_OVERRIDE_KEY, JSON.stringify(all));
}
