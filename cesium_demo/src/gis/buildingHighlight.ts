import { Cesium, viewer } from "../viewer";
import type { ParsedAmenity } from "../amenities/osmToGeojson";

const API_BASE = "http://localhost:4000";

interface BuildingFootprint {
  id: string;
  externalId: string | null;
  name: string | null;
  buildingType: string | null;
  height: number;
  areaSqm: number | null;
  centroid: { lat: number; lon: number };
  geojson: {
    type: "MultiPolygon" | "Polygon";
    coordinates: number[][][][];
  };
}

// ── Single-click highlight state ──────────────────────────────────────────────
let _highlightEntity: Cesium.Entity | null = null;
let _infoCard: HTMLElement | null = null;
let _lastFetch = "";

// ── Multi-result highlight state ──────────────────────────────────────────────
const _amenityEntities: Cesium.Entity[] = [];

// ── Radius border state ───────────────────────────────────────────────────────
let _radiusEntity: Cesium.Entity | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function ringToCartesian(ring: number[][]): Cesium.Cartesian3[] {
  const flat = ring.flatMap(([lon, lat]) => [lon, lat]);
  return Cesium.Cartesian3.fromDegreesArray(flat);
}

function getFirstRing(geojson: BuildingFootprint["geojson"]): number[][] | null {
  if (geojson.type === "MultiPolygon") return geojson.coordinates[0]?.[0] ?? null;
  return (geojson.coordinates as unknown as number[][][])[0] ?? null;
}

// ── Single-click highlight ────────────────────────────────────────────────────

export function clearHighlight(): void {
  if (_highlightEntity) { viewer.entities.remove(_highlightEntity); _highlightEntity = null; }
  _infoCard?.remove();
  _infoCard = null;
}

function showInfoCard(fp: BuildingFootprint, label?: string): void {
  _infoCard?.remove();
  const card = document.createElement("div");
  card.id = "bldHighlightCard";
  card.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:rgba(15,20,30,0.92);color:#e8eaf0;border-radius:12px;
    padding:12px 20px;font-family:sans-serif;font-size:13px;
    border:1px solid rgba(100,160,255,0.35);backdrop-filter:blur(8px);
    box-shadow:0 4px 24px rgba(0,0,0,0.5);z-index:9999;
    display:flex;align-items:center;gap:16px;min-width:260px;
  `;
  const name  = label ?? fp.name ?? fp.buildingType ?? "Building";
  const area  = fp.areaSqm ? `${Math.round(fp.areaSqm)} m²` : "—";
  const ht    = `${fp.height.toFixed(0)} m`;
  card.innerHTML = `
    <div style="flex:1">
      <div style="font-size:15px;font-weight:600;color:#7eb8ff;margin-bottom:4px">${name}</div>
      <div style="color:#aab4c8;font-size:12px">
        Area: <b style="color:#e8eaf0">${area}</b> &nbsp;·&nbsp;
        Height: <b style="color:#e8eaf0">${ht}</b>
        ${fp.externalId ? `<br><span style="opacity:.5">${fp.externalId}</span>` : ""}
      </div>
    </div>
    <button id="bldHighlightClose" style="
      background:none;border:none;color:#7eb8ff;font-size:18px;cursor:pointer;line-height:1;padding:0 4px
    ">✕</button>
  `;
  document.body.appendChild(card);
  card.querySelector("#bldHighlightClose")?.addEventListener("click", clearHighlight);
  _infoCard = card;
}

function renderSingleFootprint(fp: BuildingFootprint, label?: string): void {
  clearHighlight();
  const ring = getFirstRing(fp.geojson);
  if (!ring?.length) return;

  _highlightEntity = viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(ringToCartesian(ring)),
      material: Cesium.Color.fromCssColorString("#4a90e2").withAlpha(0.4),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString("#7eb8ff"),
      outlineWidth: 2,
      extrudedHeight: fp.height,
      height: 0,
    },
  });

  viewer.flyTo(_highlightEntity, {
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-55), 300),
    duration: 1.2,
  });

  showInfoCard(fp, label);
}

export async function highlightBuildingAt(lat: number, lon: number): Promise<void> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (key === _lastFetch) { clearHighlight(); _lastFetch = ""; return; }
  _lastFetch = key;

  console.log(`[building] click → ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  try {
    const res = await fetch(`${API_BASE}/api/building?lat=${lat}&lng=${lon}`);
    if (!res.ok) {
      if (res.status === 404) {
        const t = document.createElement("div");
        t.textContent = "No building data at this location";
        t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(30,30,40,0.9);color:#aab4c8;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;pointer-events:none";
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
      }
      clearHighlight(); return;
    }
    const fp: BuildingFootprint = await res.json();
    console.log(`[building] found: ${fp.name ?? fp.externalId} (${fp.areaSqm?.toFixed(0)} m²)`);
    renderSingleFootprint(fp);
  } catch (e) {
    console.warn("[building] fetch failed — is backend running on :4000?", e);
  }
}

// ── Multi-amenity highlight ───────────────────────────────────────────────────

export function clearAmenityHighlights(): void {
  for (const e of _amenityEntities) viewer.entities.remove(e);
  _amenityEntities.length = 0;
}

async function fetchFootprint(lat: number, lon: number): Promise<BuildingFootprint | null> {
  try {
    const res = await fetch(`${API_BASE}/api/building?lat=${lat}&lng=${lon}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export interface AmenityHighlightEntry {
  amenity: ParsedAmenity;
  color: string; // that amenity's own category color, e.g. AmenityDef.color
}

/**
 * Highlight all buildings for a set of amenity results, each in its own
 * category's color. Called automatically when the Explore Nearby panel
 * renders a category.
 */
export async function highlightAmenitySet(entries: AmenityHighlightEntry[]): Promise<void> {
  clearAmenityHighlights();
  if (!entries.length) return;

  // Safety ceiling only (real searches rarely exceed this) — was capped at 40,
  // which silently dropped real-height rendering for anything beyond the
  // first 40 results in a busy area.
  const batch = entries.slice(0, 300);

  // Fetch all in parallel
  const footprints = await Promise.allSettled(
    batch.map((e) => fetchFootprint(e.amenity.lat, e.amenity.lon))
  );

  footprints.forEach((result, i) => {
    if (result.status !== "fulfilled" || !result.value) return;
    const fp   = result.value;
    const { amenity: am, color } = batch[i];
    const ring = getFirstRing(fp.geojson);
    if (!ring?.length) return;

    const cesiumColor = Cesium.Color.fromCssColorString(color);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(am.lon, am.lat),
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ringToCartesian(ring)),
        material: cesiumColor,
        outline: true,
        outlineColor: cesiumColor.brighten(0.4, new Cesium.Color()),
        outlineWidth: 2,
        extrudedHeight: fp.height,
        height: 0,
      },
      label: {
        text: am.name || "Building",
        font: "bold 12px sans-serif",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -4),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(200, 1.0, 3000, 0.0),
        scaleByDistance: new Cesium.NearFarScalar(100, 1.2, 2000, 0.6),
      },
    });

    _amenityEntities.push(entity);
  });

  console.log(`[building] highlighted ${_amenityEntities.length} amenity buildings`);
}

// ── Search radius border ──────────────────────────────────────────────────────

function circlePolyline(lat: number, lon: number, radiusM: number, steps = 90): Cesium.Cartesian3[] {
  const pts: Cesium.Cartesian3[] = [];
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    pts.push(Cesium.Cartesian3.fromDegrees(lon + dLon * Math.sin(a), lat + dLat * Math.cos(a)));
  }
  return pts;
}

export function drawRadiusBorder(lat: number, lon: number, radiusM: number): void {
  if (_radiusEntity) viewer.entities.remove(_radiusEntity);

  _radiusEntity = viewer.entities.add({
    polyline: {
      positions: circlePolyline(lat, lon, radiusM),
      width: 2.5,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString("#4a90e2").withAlpha(0.85),
        dashLength: 20,
      }),
      clampToGround: true,
    },
  });
}

export function clearRadiusBorder(): void {
  if (_radiusEntity) { viewer.entities.remove(_radiusEntity); _radiusEntity = null; }
}

/**
 * Highlight a single amenity card click — prominent blue + fly.
 */
export async function highlightAmenityCard(am: ParsedAmenity): Promise<void> {
  clearHighlight();
  const fp = await fetchFootprint(am.lat, am.lon);
  if (!fp) return;
  renderSingleFootprint(fp, am.name);
}
