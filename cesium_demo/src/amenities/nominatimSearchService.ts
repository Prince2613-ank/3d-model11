// Fast amenity search via Nominatim structured search API.
// Much faster than Overpass (pre-indexed, <2s typical).
// Returns ParsedAmenity[] — same shape as the Overpass pipeline.

import { AmenityDef } from "./constants";
import { ParsedAmenity } from "./osmToGeojson";

interface NomPlace {
  osm_type:     string;
  osm_id:       number;
  lat:          string;
  lon:          string;
  display_name: string;
  name?:        string;
  address:      Record<string, string>;
  extratags:    Record<string, string>;
  boundingbox?: [string, string, string, string]; // [lat_min, lat_max, lon_min, lon_max]
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const HEADERS   = {
  "Accept-Language": "en-US,en",
  "Accept":          "application/json",
  "User-Agent":      "FloDataIndoorNav/1.0 (office@flodataanalytics.com)",
};

function viewbox(lat: number, lon: number, radiusM: number): string {
  const dLat = radiusM / 111_000;
  const dLon = radiusM / (111_000 * Math.cos((lat * Math.PI) / 180));
  // format: lon_min,lat_max,lon_max,lat_min
  return `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
}

function buildAddress(a: Record<string, string>): string {
  return [
    a.house_number,
    a.road ?? a.pedestrian ?? a.footway,
    a.suburb ?? a.neighbourhood,
    a.city ?? a.town ?? a.village,
  ].filter(Boolean).join(", ");
}

function resolveHeight(ext: Record<string, string>, fallback: number): number {
  const levels = parseFloat(ext["building:levels"] ?? "");
  if (!isNaN(levels) && levels > 0) return Math.round(levels * 3.5);
  const h = parseFloat(ext["height"] ?? "");
  if (!isNaN(h) && h > 0) return h;
  return fallback;
}

async function searchOne(
  params: Record<string, string>,
  lat: number, lon: number, radiusM: number, limit: number,
): Promise<NomPlace[]> {
  const url = new URL(NOMINATIM);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("format",         "json");
  url.searchParams.set("limit",          String(limit));
  url.searchParams.set("viewbox",        viewbox(lat, lon, radiusM));
  url.searchParams.set("bounded",        "1");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags",      "1");
  url.searchParams.set("namedetails",    "1");

  // For keyword (q=) searches, also set dedupe=1 to avoid duplicates within one call
  if (params["q"]) url.searchParams.set("dedupe", "1");

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5_000);
  try {
    const res = await fetch(url.toString(), { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as NomPlace[];
  } finally {
    clearTimeout(timer);
  }
}

export async function nominatimSearch(
  def: AmenityDef,
  radiusM: number,
  lat: number,
  lon: number,
): Promise<ParsedAmenity[]> {
  if (!def.nominatimParams || def.nominatimParams.length === 0) return [];

  // Fire all param-sets in parallel (e.g. hospital has amenity + healthcare variants)
  const allResults = await Promise.allSettled(
    def.nominatimParams.map((p) => searchOne(p, lat, lon, radiusM, 50)),
  );

  const seen  = new Set<string>();
  const out: ParsedAmenity[] = [];

  for (const r of allResults) {
    if (r.status !== "fulfilled") continue;
    for (const p of r.value) {
      const key = `${p.osm_type}-${p.osm_id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const ext  = p.extratags ?? {};
      const addr = p.address   ?? {};
      const plat = parseFloat(p.lat);
      const plon = parseFloat(p.lon);

      const tags: Record<string, string> = {
        name:           p.name ?? "",
        "addr:street":  addr.road ?? addr.pedestrian ?? "",
        "addr:city":    addr.city ?? addr.town ?? addr.village ?? "",
        "addr:full":    buildAddress(addr),
        phone:          ext.phone ?? ext["contact:phone"] ?? ext["phone:mobile"] ?? "",
        opening_hours:  ext.opening_hours ?? ext.service_times ?? "",
        website:        ext.website ?? ext["contact:website"] ?? "",
        email:          ext.email ?? ext["contact:email"] ?? "",
        description:    ext.description ?? "",
        operator:       ext.operator ?? ext.brand ?? "",
      };

      out.push({
        id:     `nom-${p.osm_type}-${p.osm_id}`,
        name:   p.name ?? p.display_name?.split(",")[0] ?? "",
        lat:    plat,
        lon:    plon,
        tags,
        geom:   { type: "Point" },
        height: resolveHeight(ext, def.heightDefault),
      });
    }
  }

  return out;
}
