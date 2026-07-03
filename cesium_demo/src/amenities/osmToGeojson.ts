export interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  tags?: Record<string, string>;
}

export interface OsmResponse {
  elements: OsmElement[];
}

export type GeomPoint = { type: "Point" };
export type GeomPolygon = { type: "Polygon"; coords: [number, number][] };

export interface ParsedAmenity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
  geom: GeomPoint | GeomPolygon;
  height: number;
}

const MAX_BUILDING_AREA_M2 = 60_000;
const MAX_NONBUILDING_AREA_M2 = 3_000;
const MAX_AMENITY_AREA_M2 = 350_000;

function bboxAreaM2(coords: { lat: number; lon: number }[]): number {
  if (coords.length < 2) return 0;
  const lats = coords.map((c) => c.lat);
  const lons = coords.map((c) => c.lon);
  const midLat = (Math.max(...lats) + Math.min(...lats)) / 2;
  const dLat = (Math.max(...lats) - Math.min(...lats)) * 111_000;
  const dLon = (Math.max(...lons) - Math.min(...lons)) * 111_000 * Math.cos((midLat * Math.PI) / 180);
  return dLat * dLon;
}

function usePolygon(tags: Record<string, string>, coords: { lat: number; lon: number }[]): boolean {
  const area = bboxAreaM2(coords);

  if (tags["building"] && area <= MAX_AMENITY_AREA_M2) return true;
  if (tags["amenity"] || tags["shop"] || tags["tourism"] || tags["healthcare"]) {
    return area <= MAX_AMENITY_AREA_M2;
  }

  if (area > MAX_BUILDING_AREA_M2) return false;
  return area < MAX_NONBUILDING_AREA_M2;
}

export function osmToAmenities(response: OsmResponse, defaultHeight: number): ParsedAmenity[] {
  const nodeMap = new Map<number, { lat: number; lon: number }>();
  for (const el of response.elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const out: ParsedAmenity[] = [];
  const seen = new Set<string>();

  for (const el of response.elements) {
    const tags = el.tags ?? {};
    if (Object.keys(tags).length === 0) continue;

    const name = tags["name"] ?? tags["name:en"] ?? tags["brand"] ?? "";
    const height = resolveHeight(tags, defaultHeight);

    if (el.type === "node") {
      if (el.lat === undefined || el.lon === undefined) continue;
      const id = `node-${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, lat: el.lat, lon: el.lon, tags, geom: { type: "Point" }, height });
      continue;
    }

    // Relations (multipolygon hospitals, schools, etc.) — use center coordinate
    // returned by `out center;` in Phase 2 of the Overpass query.
    if (el.type === "relation") {
      const c = el.center;
      if (!c) continue;
      const id = `relation-${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, lat: c.lat, lon: c.lon, tags, geom: { type: "Point" }, height });
      continue;
    }

    if (el.type !== "way") continue;

    const id = `way-${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    if (el.nodes && el.nodes.length >= 2) {
      const coords = el.nodes
        .map((nid) => nodeMap.get(nid))
        .filter((n): n is { lat: number; lon: number } => n !== undefined);

      if (coords.length >= 2) {
        const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
        const lon = coords.reduce((s, c) => s + c.lon, 0) / coords.length;
        const isClosed = el.nodes[0] === el.nodes[el.nodes.length - 1] && coords.length >= 3;

        out.push({
          id,
          name,
          lat,
          lon,
          tags,
          geom: isClosed && usePolygon(tags, coords)
            ? { type: "Polygon", coords: coords.map((c) => [c.lon, c.lat]) }
            : { type: "Point" },
          height,
        });
        continue;
      }
    }

    const c = el.center;
    if (!c) continue;
    out.push({ id, name, lat: c.lat, lon: c.lon, tags, geom: { type: "Point" }, height });
  }

  // Drop unnamed results that came from building= ways (no amenity/landuse tag) —
  // they only add noise like "college" with no actual name.
  return out.filter((a) => {
    if (a.name) return true;
    const t = a.tags;
    // Keep if it has a real amenity/landuse/tourism/shop tag — drop pure building-only entries
    return !!(t["amenity"] || t["landuse"] || t["tourism"] || t["shop"] || t["healthcare"]);
  });
}

function resolveHeight(tags: Record<string, string>, fallback: number): number {
  const levels = parseFloat(tags["building:levels"] ?? "");
  if (!Number.isNaN(levels) && levels > 0) return Math.round(levels * 3.5);

  const height = parseFloat(tags["height"] ?? "");
  if (!Number.isNaN(height) && height > 0) return height;

  return fallback;
}
