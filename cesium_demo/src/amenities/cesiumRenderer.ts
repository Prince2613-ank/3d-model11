// All CesiumJS rendering for the amenities feature:
//   - Extruded building polygons + point markers per category
//   - Animated OSRM route polyline
//   - GPS user-location dot
// Uses the existing singleton `viewer` from viewer.ts.

import * as Cesium from "cesium";
import { viewer } from "../viewer";
import { AmenityKey, AmenityDef } from "./constants";
import { ParsedAmenity } from "./osmToGeojson";
import { fetchRoute, RouteResult } from "./routingService";
import { RouteMode } from "./constants";

// Per-category rendered entity lists (for selective show/hide/clear)
const entityMap = new Map<AmenityKey, Cesium.Entity[]>();
let routeEntity: Cesium.Entity | null = null;
let userDot: Cesium.Entity | null = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * When OSM only has a node (no building footprint), synthesise a small
 * rectangular polygon so every amenity renders as an extruded 3D building.
 * sizeM controls the half-width of the box in metres.
 */
function syntheticFootprint(lat: number, lon: number, sizeM = 8): number[] {
  const dLat = sizeM / 111_000;
  const dLon = sizeM / (111_000 * Math.cos((lat * Math.PI) / 180));
  // Returns flat [lon,lat, lon,lat, …] ring (4 corners)
  return [
    lon - dLon, lat - dLat,
    lon + dLon, lat - dLat,
    lon + dLon, lat + dLat,
    lon - dLon, lat + dLat,
  ];
}

// ── Amenity rendering ────────────────────────────────────────────────────────

export function renderAmenities(
  category: AmenityKey,
  amenities: ParsedAmenity[],
  def: AmenityDef,
): void {
  clearCategory(category);
  const [r, g, b, a] = def.rgba;
  const fill    = new Cesium.Color(r, g, b, a);
  const outline = Cesium.Color.WHITE.withAlpha(0.85);
  const entities: Cesium.Entity[] = [];

  for (const am of amenities) {
    const displayName = am.name || def.label;
    const props = new Cesium.PropertyBag({ amenity_id: am.id });

    // Resolve flat [lon,lat,…] ring — use OSM polygon if available,
    // otherwise synthesise a building-sized box around the node centroid.
    const flat: number[] =
      am.geom.type === "Polygon"
        ? am.geom.coords.flatMap(([lon, lat]) => [lon, lat])
        : syntheticFootprint(am.lat, am.lon);

    // Flat, ground-level category marker only — real building height comes
    // from highlightAmenitySet() (buildingHighlight.ts), which fetches each
    // amenity's actual building height from the backend and renders the real
    // extruded 3D block on top of this. Faking a height here (the old
    // per-category heightDefault, e.g. 25m for every hospital regardless of
    // its real height) produced a wrong, uniform extrusion that fought with
    // the real one, so this no longer extrudes at all.
    entities.push(
      viewer.entities.add({
        name: displayName,
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(am.lon, am.lat),
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(
            Cesium.Cartesian3.fromDegreesArray(flat),
          ),
          height: 0,
          material: fill,
          outline: true,
          outlineColor: outline,
          outlineWidth: 1.5,
        },
        label: {
          text: `${def.icon} ${displayName}`,
          font: "bold 12px sans-serif",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, -4),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000),
        },
      }),
    );
  }

  entityMap.set(category, entities);
  viewer.scene.requestRender();
}

export function clearCategory(category: AmenityKey): void {
  const list = entityMap.get(category) ?? [];
  list.forEach((e) => viewer.entities.remove(e));
  entityMap.delete(category);
  viewer.scene.requestRender();
}

export function clearAllAmenityEntities(): void {
  for (const [key] of entityMap) clearCategory(key);
}

// ── Route rendering ──────────────────────────────────────────────────────────

export async function renderRoute(
  fromLat: number, fromLon: number,
  toLat: number,   toLon: number,
  mode: RouteMode,
): Promise<RouteResult> {
  clearRoute();

  const result = await fetchRoute(fromLat, fromLon, toLat, toLon, mode);

  // coords are [lon,lat] pairs from OSRM GeoJSON
  const positions = Cesium.Cartesian3.fromDegreesArray(
    result.coords.flatMap(([lon, lat]) => [lon, lat]),
  );

  routeEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 7,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#2196F3").withAlpha(0.95),
        gapColor: Cesium.Color.TRANSPARENT,
        dashLength: 18,
      }),
      clampToGround: true,
      zIndex: 10,
    },
  });

  // Fly to show full route
  const sphere = Cesium.BoundingSphere.fromPoints(positions);
  const radius = Math.max(sphere.radius * 1.6, 400);
  viewer.camera.flyToBoundingSphere(
    new Cesium.BoundingSphere(sphere.center, radius),
    {
      duration: 2,
      offset: new Cesium.HeadingPitchRange(
        viewer.camera.heading,
        Cesium.Math.toRadians(-50),
        0,
      ),
    },
  );

  viewer.scene.requestRender();
  return result;
}

export function clearRoute(): void {
  if (routeEntity) {
    viewer.entities.remove(routeEntity);
    routeEntity = null;
    viewer.scene.requestRender();
  }
}

// ── User GPS dot ─────────────────────────────────────────────────────────────

export function updateUserLocationDot(lat: number, lon: number): void {
  const pos = Cesium.Cartesian3.fromDegrees(lon, lat, 4);
  if (!userDot) {
    userDot = viewer.entities.add({
      position: pos,
      point: {
        pixelSize: 20,
        color: Cesium.Color.fromCssColorString("#1565C0").withAlpha(0.92),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: "📍 You",
        font: "bold 12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
  } else {
    (userDot as any).position = new Cesium.ConstantPositionProperty(pos);
  }
  viewer.scene.requestRender();
}

export function clearUserLocationDot(): void {
  if (userDot) {
    viewer.entities.remove(userDot);
    userDot = null;
    viewer.scene.requestRender();
  }
}

// ── Camera ───────────────────────────────────────────────────────────────────

export function flyToPoint(lat: number, lon: number, altAbove = 250): void {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altAbove),
    orientation: {
      heading: viewer.camera.heading,
      pitch: Cesium.Math.toRadians(-40),
      roll: 0,
    },
    duration: 1.6,
  });
  viewer.scene.requestRender();
}
