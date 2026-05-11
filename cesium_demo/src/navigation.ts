import {
  Cesium,
  ALT_2ND,
  ALT_3RD,
  viewer
} from "./viewer";
import { geo2, geo3, geoJsonUrl, normalizeRoomName } from "./rooms";
import { setNavigationAllowedFloors, setNavigationMessage, updateNavigationUI, disableCameraControls, enableCameraControls, showFloorSpinner, hideFloorSpinner } from "./ui";
import { ensureFloorModelLoaded } from "./models";

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

type ResolvedRoomSelection = {
  displayName: string;
  roomName: string;
  floor: number;
};

const doorPositions = new Map<string, Cesium.Cartesian3>();
let centerlineGraph2: GraphNode[] | null = null;
let centerlineGraph3: GraphNode[] | null = null;
let navDataReady = false;
let currentVisibleFloor = 0;

const routeArrowCollectionA = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeArrowCollectionB = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeBubbleCollectionA = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeBubbleCollectionB = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeGlowCollectionA = viewer.scene.primitives.add(new Cesium.BillboardCollection());
const routeGlowCollectionB = viewer.scene.primitives.add(new Cesium.BillboardCollection());

let liveNavTimer: number | null = null;
let liveNavPath: Cesium.Cartesian3[] = [];
let liveNavFloorByIndex: number[] = [];
let liveNavIndex = 0;
let liveNavActiveFloor: number | null = null;
let liveNavPendingFloor: number | null = null;
let navigationFloorSwitchHandler: ((floor: number) => void | Promise<void>) | null = null;
let routeGlowTimer: number | null = null;
let routeGlowTick = 0;
let routeBubbleBillboardsA: Cesium.Billboard[] = [];
let routeBubbleBillboardsB: Cesium.Billboard[] = [];
let routeBubbleDensityStride = 1;
const MAX_CORRIDOR_EDGE_METERS = 8.0;
const JUNCTION_LINK_METERS = 0.5;
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

const ROUTE_BUBBLE_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,255,255,0.96)" stroke-width="7"/>
  <circle cx="32" cy="32" r="21" fill="#0B3D91"/>
</svg>
`)}`;

const ROUTE_GLOW_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#8FD6FF" stop-opacity="0.76"/>
      <stop offset="35%" stop-color="#1A57D6" stop-opacity="0.38"/>
      <stop offset="100%" stop-color="#1A57D6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="60" cy="60" r="54" fill="url(#g)"/>
</svg>
`)}`;

const CUSTOM_STAIR_PATH = [
  { lon: 77.13369487589452, lat: 28.67089514560174 },
  { lon: 77.13369762958561, lat: 28.670896829794504 },
  { lon: 77.13370575798822, lat: 28.670902046216586 },
  { lon: 77.13368821772951, lat: 28.670936267563533 },
  { lon: 77.13368355420981, lat: 28.67093314152187 },
  { lon: 77.13369675630433, lat: 28.670908889590613 }
];

viewer.camera.changed.addEventListener(() => {
  applyRouteBubbleDensity();
});

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
  routeArrowCollectionA.removeAll();
  routeArrowCollectionB.removeAll();
  routeBubbleCollectionA.removeAll();
  routeBubbleCollectionB.removeAll();
  routeBubbleBillboardsA = [];
  routeBubbleBillboardsB = [];
  routeBubbleDensityStride = 1;
  routeGlowCollectionA.removeAll();
  routeGlowCollectionB.removeAll();

  if (routeGlowTimer !== null) {
    window.clearInterval(routeGlowTimer);
    routeGlowTimer = null;
  }
}

function stopLiveNavigationMarker(): void {
  if (liveNavTimer !== null) {
    window.clearInterval(liveNavTimer);
    liveNavTimer = null;
  }
  liveNavPath = [];
  liveNavFloorByIndex = [];
  liveNavIndex = 0;
  liveNavActiveFloor = null;
  liveNavPendingFloor = null;
  viewer.entities.removeById("liveNavigationMarker");
}

function requestLiveNavigationFloor(floor: number | undefined): void {
  if (!floor || floor === liveNavActiveFloor || floor === liveNavPendingFloor) return;

  liveNavPendingFloor = floor;
  void Promise.resolve(navigationFloorSwitchHandler?.(floor))
    .then(() => {
      liveNavActiveFloor = floor;
    })
    .catch((error) => {
      console.error(`Failed to switch navigation floor to ${floor}:`, error);
    })
    .finally(() => {
      if (liveNavPendingFloor === floor) {
        liveNavPendingFloor = null;
      }
    });
}

function startLiveNavigationMarker(path: Cesium.Cartesian3[], floorByIndex: number[]): void {
  stopLiveNavigationMarker();

  if (path.length < 2) return;

  liveNavPath = path;
  liveNavFloorByIndex = floorByIndex;
  liveNavIndex = 0;
  requestLiveNavigationFloor(liveNavFloorByIndex[0]);

  viewer.entities.add({
    id: "liveNavigationMarker",
    position: path[0],
    point: {
      pixelSize: 14,
      color: Cesium.Color.fromCssColorString("#1a57d6"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  liveNavTimer = window.setInterval(() => {
    const marker = viewer.entities.getById("liveNavigationMarker");
    if (!marker || liveNavPath.length === 0) return;

    liveNavIndex = (liveNavIndex + 1) % liveNavPath.length;
    marker.position = new Cesium.ConstantPositionProperty(liveNavPath[liveNavIndex]);
    requestLiveNavigationFloor(liveNavFloorByIndex[liveNavIndex]);

    viewer.scene.requestRender();
  }, 300);
}

export function setNavigationFloorSwitchHandler(
  handler: ((floor: number) => void | Promise<void>) | null
): void {
  navigationFloorSwitchHandler = handler;
}

export let activeNavFromFloor: number | null = null;
export let activeNavToFloor: number | null = null;

export function exitNavigation(): void {
  stopLiveNavigationMarker();
  clearRouteEntities();
  activeNavFromFloor = null;
  activeNavToFloor = null;
  setNavigationAllowedFloors(null);
  enableCameraControls();
  setNavigationMessage("Choose rooms to start navigation.");
  viewer.scene.requestRender();
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
  if (stairs) stairs.show = false;
  
  const dot = viewer.entities.getById("navMarkerDot");
  if (dot) dot.show = showStairs;

  const liveMarker = viewer.entities.getById("liveNavigationMarker");
  if (liveMarker) liveMarker.show = showStairs;

  const startMarker = viewer.entities.getById("startMarker");
  if (startMarker) startMarker.show = showA;

  const endMarker = viewer.entities.getById("endMarker");
  if (endMarker) endMarker.show = showB;
  
  routeArrowCollectionA.show = false;
  routeArrowCollectionB.show = false;
  routeBubbleCollectionA.show = showA;
  routeBubbleCollectionB.show = showB;
  routeGlowCollectionA.show = showA;
  routeGlowCollectionB.show = showB;
  applyRouteBubbleDensity(true);

  if (activeNavFromFloor && activeNavToFloor) {
    let message = "Continue navigation on this floor.";
    if (activeNavFromFloor !== activeNavToFloor && activeFloor === activeNavFromFloor) {
      message = "Proceed to stairs, then switch floor to continue.";
    }
    setNavigationMessage(message, false);
  }
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
      geometry?: { type: string; coordinates: [number, number] };
      properties?: { id?: number | string };
    }>;
  };

  const points = geoJsonData.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature, index) => {
      const coordinates = feature.geometry?.coordinates ?? [0, 0];
      return {
        lon: coordinates[0],
        lat: coordinates[1],
        id: feature.properties?.id ?? `node-${index}`
      };
    });

  return buildCenterlineGraph(points, altitude);
}

function buildCenterlineGraph(points: Array<{ lon: number; lat: number; id: number | string }>, altitude: number): GraphNode[] {
  const graph: GraphNode[] = points.map((point) => ({
    pos: Cesium.Cartesian3.fromDegrees(point.lon, point.lat, altitude + 0.1),
    lon: point.lon,
    lat: point.lat,
    id: point.id,
    edges: []
  }));

  for (let index = 0; index < graph.length - 1; index += 1) {
    const distance = Cesium.Cartesian3.distance(graph[index].pos, graph[index + 1].pos);
    if (distance <= MAX_CORRIDOR_EDGE_METERS) {
      graph[index].edges.push({ node: graph[index + 1], w: distance });
      graph[index + 1].edges.push({ node: graph[index], w: distance });
    }
  }

  for (let i = 0; i < graph.length; i += 1) {
    for (let j = i + 1; j < graph.length; j += 1) {
      const distance = Cesium.Cartesian3.distance(graph[i].pos, graph[j].pos);
      if (distance < JUNCTION_LINK_METERS) {
        graph[i].edges.push({ node: graph[j], w: distance });
        graph[j].edges.push({ node: graph[i], w: distance });
      }
    }
  }

  return graph;
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

      const nextDistance = currentDistance + edge.w;
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

function samplePathByDistance(path: Cesium.Cartesian3[], spacingMeters = 1.2): Cesium.Cartesian3[] {
  if (path.length < 2) return path;

  const sampled: Cesium.Cartesian3[] = [path[0]];
  let carry = 0;

  for (let i = 1; i < path.length; i += 1) {
    const start = path[i - 1];
    const end = path[i];
    const segmentLength = Cesium.Cartesian3.distance(start, end);
    if (segmentLength < 0.001) continue;

    let distance = spacingMeters - carry;

    while (distance < segmentLength) {
      const t = distance / segmentLength;
      sampled.push(Cesium.Cartesian3.lerp(start, end, t, new Cesium.Cartesian3()));
      distance += spacingMeters;
    }

    carry = segmentLength - (distance - spacingMeters);
  }

  sampled.push(path[path.length - 1]);
  return sampled;
}

function addRouteBubbles(
  collection: Cesium.BillboardCollection,
  path: Cesium.Cartesian3[],
  spacingMeters = 0.45
): Cesium.Cartesian3[] {
  const points = samplePathByDistance(path, spacingMeters);
  const billboards = collection === routeBubbleCollectionA ? routeBubbleBillboardsA : routeBubbleBillboardsB;

  points.forEach((position, index) => {
    const billboard = collection.add({
      position,
      image: ROUTE_BUBBLE_SVG,
      scale: index === 0 || index === points.length - 1 ? 0.175 : 0.125,
      scaleByDistance: new Cesium.NearFarScalar(8, 1.2, 100, 1.5),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    billboards.push(billboard);
  });

  return points;
}

function routeBubbleStrideForCamera(): number {
  const height = viewer.camera.positionCartographic.height;
  if (height < 45) return 1;
  if (height < 100) return 1;
  if (height < 170) return 2;
  return 3;
}

function applyRouteBubbleDensity(force = false): void {
  const stride = routeBubbleStrideForCamera();
  if (!force && stride === routeBubbleDensityStride) return;

  routeBubbleDensityStride = stride;
  const updateBillboards = (billboards: Cesium.Billboard[]) => {
    const lastIndex = billboards.length - 1;
    billboards.forEach((billboard, index) => {
      billboard.show = index === 0 || index === lastIndex || index % stride === 0;
    });
  };

  updateBillboards(routeBubbleBillboardsA);
  updateBillboards(routeBubbleBillboardsB);
  viewer.scene.requestRender();
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
      scale: 0.3,
      color: Cesium.Color.WHITE.withAlpha(0.5),
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: false,
    }));
  }

  return glows;
}

function startRouteGlowAnimation(
  pointsA: Cesium.Cartesian3[],
  pointsB: Cesium.Cartesian3[]
): void {
  if (routeGlowTimer !== null) {
    window.clearInterval(routeGlowTimer);
    routeGlowTimer = null;
  }

  routeGlowCollectionA.removeAll();
  routeGlowCollectionB.removeAll();

  const glowsA = addGlowBillboards(routeGlowCollectionA, 3);
  const glowsB = addGlowBillboards(routeGlowCollectionB, 3);

  routeGlowTick = 0;

  routeGlowTimer = window.setInterval(() => {
    routeGlowTick += 1;

    const updateGlows = (points: Cesium.Cartesian3[], glows: Cesium.Billboard[]) => {
      if (points.length === 0) {
        glows.forEach((glow) => {
          glow.show = false;
        });
        return;
      }

      glows.forEach((glow, index) => {
        const offset = index * Math.max(3, Math.floor(points.length / 3));
        const pointIndex = (routeGlowTick + offset) % points.length;
        const lowered = Cesium.Cartesian3.add(
          points[pointIndex],
          new Cesium.Cartesian3(0, 0, -0.08),
          new Cesium.Cartesian3()
        );

        glow.position = lowered;
        glow.show = true;
        glow.scale = 0.26 + 0.05 * Math.sin((routeGlowTick + index * 8) * 0.22);
      });
    };

    updateGlows(pointsA, glowsA);
    updateGlows(pointsB, glowsB);

    viewer.scene.requestRender();
  }, 90);
}

function generateTurnSteps(path: Cesium.Cartesian3[]): Array<{ icon: string; title: string; primary: string }> {
  if (path.length < 2) return [];
  const steps: Array<{ icon: string; title: string; primary: string }> = [];
  
  let currentHeading = headingENU(path[0], path[1]);
  let accumulatedDistance = Cesium.Cartesian3.distance(path[0], path[1]);
  
  steps.push({
    icon: "↑",
    title: "Start",
    primary: "Go forward"
  });
  
  for (let i = 1; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i+1];
    const distance = Cesium.Cartesian3.distance(p1, p2);
    if (distance < 0.8) {
      accumulatedDistance += distance;
      continue; 
    }
    
    const nextHeading = headingENU(p1, p2);
    let angleDiff = nextHeading - currentHeading;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    if (Math.abs(angleDiff) > 0.45) { // roughly 25 degrees
      steps[steps.length - 1].primary += ` for ${Math.max(1, Math.round(accumulatedDistance))} m`;
      
      const turnDir = angleDiff > 0 ? "left" : "right";
      steps.push({
        icon: angleDiff > 0 ? "↰" : "↱",
        title: `Turn ${turnDir}`,
        primary: `Turn ${turnDir} and go ahead`
      });
      
      currentHeading = nextHeading;
      accumulatedDistance = distance;
    } else {
      accumulatedDistance += distance;
    }
  }
  
  steps[steps.length - 1].primary += ` for ${Math.max(1, Math.round(accumulatedDistance))} m`;
  return steps;
}

function drawRoute(
  pathA: Cesium.Cartesian3[],
  pathB: Cesium.Cartesian3[]
): { pointsA: Cesium.Cartesian3[]; pointsB: Cesium.Cartesian3[] } {
  clearRouteEntities();

  let pointsA: Cesium.Cartesian3[] = [];
  let pointsB: Cesium.Cartesian3[] = [];

  if (pathA.length > 1) {
    viewer.entities.add({
      id: "navigationLineA",
      show: false,
      polyline: {
        positions: pathA,
        width: 1,
        material: Cesium.Color.TRANSPARENT,
      },
    });

    pointsA = addRouteBubbles(routeBubbleCollectionA, pathA, 0.40);
  }

  if (pathB.length > 1) {
    viewer.entities.add({
      id: "navigationLineB",
      show: false,
      polyline: {
        positions: pathB,
        width: 1,
        material: Cesium.Color.TRANSPARENT,
      },
    });

    pointsB = addRouteBubbles(routeBubbleCollectionB, pathB, 0.40);
  }

  const start = pathA[0];
  const end = pathB.length > 0
    ? pathB[pathB.length - 1]
    : pathA[pathA.length - 1];

  viewer.entities.add({
    id: "startMarker",
    position: start,
    point: {
      pixelSize: 24,
      color: Cesium.Color.fromCssColorString("#0B3D91"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  viewer.entities.add({
    id: "endMarker",
    position: end,
    point: {
      pixelSize: 26,
      color: Cesium.Color.fromCssColorString("#e53935"),
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 5,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  startRouteGlowAnimation(pointsA, pointsB);
  updateNavigationVisibility(currentVisibleFloor);
  viewer.scene.requestRender();

  return { pointsA, pointsB };
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

function resolveRoomSelection(value: string): ResolvedRoomSelection | null {
  if (!value) return null;

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
  const position = entity?.position?.getValue(Cesium.JulianDate.now());
  if (position) return position;

  const hierarchy = entity?.polygon?.hierarchy?.getValue(Cesium.JulianDate.now());
  const positions = hierarchy?.positions ?? [];
  if (positions.length === 0) return undefined;

  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const cartographic = Cesium.Cartographic.fromCartesian(sphere.center);
  const altitude = floor === 3 ? ALT_2ND : ALT_3RD;
  return Cesium.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude, altitude + 0.1);
}

function getDoorPosition(roomName: string, floor: number): Cesium.Cartesian3 | undefined {
  if (floor === 3 && normalizeRoomName(roomName) === "pantry") {
    return SECOND_FLOOR_PANTRY_EMPLOYEE_SIDE_DOOR;
  }

  return doorPositions.get(`${floor}|${roomName}`)
    ?? doorPositions.get(`${floor}|${normalizeRoomName(roomName)}`)
    ?? getRoomFallbackPosition(roomName, floor);
}

function shouldUseFirstThirdFloorPantryDoor(otherSelection: ResolvedRoomSelection): boolean {
  // Any 2nd-floor room always uses the 1st door
  if (otherSelection.floor === 3) return true;
  // On the 3rd floor, only entrance and library use the 1st door
  if (otherSelection.floor === 4) {
    const otherRoom = normalizeRoomName(otherSelection.roomName);
    return otherRoom === "entrance" || otherRoom === "library";
  }
  return false;
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

  return getDoorPosition(selection.roomName, selection.floor);
}

function graphForFloor(floor: number): GraphNode[] | null {
  return floor === 3 ? centerlineGraph2 : centerlineGraph3;
}

function floorLabel(floor: number): string {
  return floor === 3 ? "2nd Floor" : floor === 4 ? "3rd Floor" : `Floor ${floor}`;
}

function floorForNavigationPosition(position: Cesium.Cartesian3, fallbackFloor: number): number {
  const height = Cesium.Cartographic.fromCartesian(position).height;
  const secondFloorDistance = Math.abs(height - ALT_2ND);
  const thirdFloorDistance = Math.abs(height - ALT_3RD);

  if (!Number.isFinite(height)) return fallbackFloor;
  return secondFloorDistance <= thirdFloorDistance ? 3 : 4;
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
  if (!geo2 || !geo3) {
    setNavigationMessage("Room data is still loading.");
    return;
  }

  await ensureNavData();

  const fromName = getSelectValue("fromRoom");
  const toName = getSelectValue("toRoom");
  const fromSelection = resolveRoomSelection(fromName);
  const toSelection = resolveRoomSelection(toName);
  if (!fromSelection || !toSelection) {
    setNavigationMessage("Choose a start and destination.");
    return;
  }

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

  if (fromFloor === toFloor) {
    const path = findPath(graphA, nearest(graphA, startDoorPosition), nearest(graphA, endDoorPosition));
    if (!path) {
      setNavigationMessage("No route found.");
      return;
    }
    pathFloorA = [startDoorPosition, ...path, endDoorPosition].map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );
  } else {
    const startAltitude = fromFloor === 3 ? ALT_2ND : ALT_3RD;
    const targetAltitude = fromFloor === 3 ? ALT_3RD : ALT_2ND;
    const landingAltitude = (startAltitude + targetAltitude) / 2;
    const bridge = fromFloor === 3 ? [...CUSTOM_STAIR_PATH] : [...CUSTOM_STAIR_PATH].reverse();
    const stairPath3D = bridge.map((point, index) => {
      let height: number;
      if (fromFloor === 3) {
        height = index <= 2 ? startAltitude : index <= 4 ? landingAltitude : targetAltitude;
      } else {
        height = index <= 1 ? startAltitude : index <= 3 ? landingAltitude : targetAltitude;
      }
      return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, height + zLift);
    });

    const part1 = findPath(graphA, nearest(graphA, startDoorPosition), nearest(graphA, stairPath3D[0]));
    const part2 = findPath(graphB, nearest(graphB, stairPath3D[stairPath3D.length - 1]), nearest(graphB, endDoorPosition));
    if (!part1 || !part2) {
      setNavigationMessage("No route found.");
      return;
    }

    pathFloorA = [startDoorPosition, ...part1].map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );
    pathFloorA.push(stairPath3D[0]);

    const liftedHallwayB = [...part2, endDoorPosition].map((position) =>
      Cesium.Cartesian3.add(position, new Cesium.Cartesian3(0, 0, zLift), new Cesium.Cartesian3())
    );
    pathFloorB = [...stairPath3D, ...liftedHallwayB];
  }

  activeNavFromFloor = fromFloor;
  activeNavToFloor = toFloor;
  setNavigationAllowedFloors([...new Set([fromFloor, toFloor])]);

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

  disableCameraControls();

  const { pointsA, pointsB } = drawRoute(pathFloorA, pathFloorB);
  const fullPath = [...pointsA, ...pointsB];
  const fullPathFloors = [
    ...pointsA.map((position) => floorForNavigationPosition(position, fromFloor)),
    ...pointsB.map((position) => floorForNavigationPosition(position, toFloor)),
  ];

  const totalDistance = Math.round(pathDistance([pathFloorA, pathFloorB]));
  
  // Generate turn-by-turn steps
  const allSteps: any[] = [];
  if (pathFloorA.length > 0) {
    allSteps.push(...generateTurnSteps(pathFloorA));
  }
  if (fromFloor !== toFloor) {
    allSteps.push({ icon: "🪜", title: "Use stairs", primary: `Move to ${floorLabel(toFloor)}` });
    if (pathFloorB.length > 0) {
      allSteps.push(...generateTurnSteps(pathFloorB));
    }
  }
  allSteps.push({ icon: "🚩", title: "Arrive at destination", text: `You have reached ${toSelection.displayName}` });

  updateNavigationUI({
    fromName: fromSelection.displayName,
    toName: toSelection.displayName,
    totalDistance,
    totalTime: Math.max(1, Math.round(totalDistance / 80)),
    list: allSteps
  });

  startLiveNavigationMarker(fullPath, fullPathFloors);
  setNavigationMessage(
    fromFloor === toFloor
      ? "Live navigation started. Follow the blue route."
      : "Proceed to stairs, then switch floor to continue.",
    false
  );
  viewer.scene.requestRender();
}

export function getActiveNavigationStartFloor(): number | null {
  return activeNavFromFloor;
}

export function getActiveNavigationEndFloor(): number | null {
  return activeNavToFloor;
}
