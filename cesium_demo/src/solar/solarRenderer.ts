// Cesium rendering for the Solar Potential feature — colors each analyzed
// building's real footprint by its estimated specific solar yield
// (kWh/m²/day), extruded to its real height, same pattern as buildingHighlight.ts.

import { Cesium, viewer } from "../viewer";
import { SolarBuildingEstimate } from "./solarService";
import { colorForProductionScore } from "./constants";

const _solarEntities: Cesium.Entity[] = [];
const _selectedSolarEntities: Cesium.Entity[] = [];
const BODY_MATERIAL = Cesium.Color.fromCssColorString("#d7dce0").withAlpha(1);
const BODY_OUTLINE = Cesium.Color.fromCssColorString("#7b858d").withAlpha(0.9);
const ROOF_HEIGHT_OFFSET_M = 0.08;
const SELECTED_MARKER_OFFSET_M = 18;

function getFirstRing(geojson: SolarBuildingEstimate["geojson"]): number[][] | null {
  if (geojson.type === "MultiPolygon") return geojson.coordinates[0]?.[0] ?? null;
  return (geojson.coordinates as unknown as number[][][])[0] ?? null;
}

function ringToCartesian(ring: number[][]): Cesium.Cartesian3[] {
  const flat = ring.flatMap(([lon, lat]) => [lon, lat]);
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

function ringToRaisedPolyline(ring: number[][], height: number): Cesium.Cartesian3[] {
  const closedRing = ring.length > 0 ? [...ring, ring[0]] : ring;
  const flat = closedRing.flatMap(([lon, lat]) => [lon, lat, height]);
  return Cesium.Cartesian3.fromDegreesArrayHeights(flat);
}

export function clearSelectedSolarHighlight(): void {
  for (const e of _selectedSolarEntities) viewer.entities.remove(e);
  _selectedSolarEntities.length = 0;
  viewer.scene.requestRender();
}

export function clearSolarEntities(): void {
  clearSelectedSolarHighlight();
  for (const e of _solarEntities) viewer.entities.remove(e);
  _solarEntities.length = 0;
  viewer.scene.requestRender();
}

export function renderSolarEstimates(estimates: SolarBuildingEstimate[]): void {
  clearSolarEntities();
  const maxDailyKwh = Math.max(...estimates.map((est) => est.dailyKwh), 1);

  for (const est of estimates) {
    const ring = getFirstRing(est.geojson);
    if (!ring?.length) continue;

    const productionScore = est.dailyKwh / maxDailyKwh;
    const [r, g, b] = colorForProductionScore(productionScore);
    const roofColor = new Cesium.Color(r, g, b, 0.9);
    const roofOutline = roofColor.brighten(0.35, new Cesium.Color());
    const props = new Cesium.PropertyBag({ solar_id: est.id });
    const hierarchy = new Cesium.PolygonHierarchy(ringToCartesian(ring));
    const height = Math.max(est.height, 0.4);

    const body = viewer.entities.add({
      properties: props,
      polygon: {
        hierarchy,
        material: BODY_MATERIAL,
        outline: true,
        outlineColor: BODY_OUTLINE,
        outlineWidth: 1,
        extrudedHeight: height,
        height: 0,
      },
    });

    const roof = viewer.entities.add({
      properties: props,
      polygon: {
        hierarchy,
        material: roofColor,
        outline: true,
        outlineColor: roofOutline,
        outlineWidth: 2,
        height: height + ROOF_HEIGHT_OFFSET_M,
      },
    });

    _solarEntities.push(body, roof);
  }

  viewer.scene.requestRender();
}

export function showSelectedSolarBuilding(building: SolarBuildingEstimate | null, labelText = "Selected building"): void {
  clearSelectedSolarHighlight();
  if (!building) return;

  const ring = getFirstRing(building.geojson);
  if (!ring?.length) return;

  const height = Math.max(building.height, 0.4);
  const roofHeight = height + ROOF_HEIGHT_OFFSET_M + 0.35;
  const markerHeight = height + SELECTED_MARKER_OFFSET_M;
  const markerPosition = Cesium.Cartesian3.fromDegrees(building.centroid.lon, building.centroid.lat, markerHeight);
  const roofPosition = Cesium.Cartesian3.fromDegrees(building.centroid.lon, building.centroid.lat, roofHeight);
  const selectionColor = Cesium.Color.fromCssColorString("#2563eb");
  const haloColor = Cesium.Color.WHITE.withAlpha(0.92);

  const halo = viewer.entities.add({
    polyline: {
      positions: ringToRaisedPolyline(ring, roofHeight + 0.03),
      width: 8,
      material: haloColor,
      clampToGround: false,
    },
  });

  const outline = viewer.entities.add({
    polyline: {
      positions: ringToRaisedPolyline(ring, roofHeight + 0.06),
      width: 4,
      material: new Cesium.PolylineGlowMaterialProperty({
        color: selectionColor,
        glowPower: 0.18,
      }),
      clampToGround: false,
    },
  });

  const stem = viewer.entities.add({
    polyline: {
      positions: [roofPosition, markerPosition],
      width: 2,
      material: selectionColor.withAlpha(0.95),
      clampToGround: false,
    },
  });

  const marker = viewer.entities.add({
    position: markerPosition,
    point: {
      pixelSize: 15,
      color: selectionColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: labelText,
      font: "700 13px Arial, sans-serif",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString("#172033"),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, -24),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

  _selectedSolarEntities.push(halo, outline, stem, marker);
  viewer.scene.requestRender();
}

export function findSolarEntityId(pickedEntity: Cesium.Entity): string | undefined {
  return pickedEntity.properties
    ?.solar_id
    ?.getValue(Cesium.JulianDate.now()) as string | undefined;
}
