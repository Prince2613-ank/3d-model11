import { AmenityKey, AMENITY_DEF_MAP } from "./constants";
import { osmToAmenities, ParsedAmenity } from "./osmToGeojson";
import { nominatimSearch } from "./nominatimSearchService";
import { applyLocalFootprintsToAmenities, searchLocalBuildingAmenities } from "./localBuildingsService";

// ── Overpass mirrors ──────────────────────────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://api.openstreetmap.fr/oapi/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

// ── Persistent cache (localStorage, 2-hour TTL) ───────────────────────────────
// Survives page reloads — first fetch is slow, every reload within 2h is instant.
const CACHE_TTL = 2 * 60 * 60 * 1000;
const LS_PREFIX = "am9_";

function lsRead(key: string): ParsedAmenity[] | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw) as { ts: number; data: ParsedAmenity[] };
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(LS_PREFIX + key); return null; }
    return data;
  } catch { return null; }
}

function lsWrite(key: string, data: ParsedAmenity[]): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Quota exceeded — evict stale entries then retry
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(LS_PREFIX)) continue;
      try {
        const { ts } = JSON.parse(localStorage.getItem(k)!);
        if (Date.now() - ts > CACHE_TTL) localStorage.removeItem(k);
      } catch { localStorage.removeItem(k); }
    }
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), data })); } catch {}
  }
}

// ── In-memory cache (current session) ────────────────────────────────────────
const memCache = new Map<string, ParsedAmenity[]>();

function amenityKey(item: ParsedAmenity): string {
  const name = item.name.trim().toLowerCase();
  return `${name}|${item.lat.toFixed(5)}|${item.lon.toFixed(5)}`;
}

function mergeAmenities(...groups: ParsedAmenity[][]): ParsedAmenity[] {
  const merged = new Map<string, ParsedAmenity>();
  for (const group of groups) {
    for (const item of group) {
      merged.set(item.id || amenityKey(item), item);
    }
  }
  return [...merged.values()];
}

function withinRadius(items: ParsedAmenity[], lat: number, lon: number, radiusM: number): ParsedAmenity[] {
  // haversine inline to avoid circular import
  return items.filter((a) => {
    const R = 6_371_000;
    const dLat = ((a.lat - lat) * Math.PI) / 180;
    const dLon = ((a.lon - lon) * Math.PI) / 180;
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) <= radiusM;
  });
}

// ── Overpass query builder ────────────────────────────────────────────────────
// Two-phase output so we get full polygon geometry for nodes/ways AND pick up
// relation-mapped amenities (common for large Indian hospitals/schools):
//   Phase 1 — node + way → out body;>;out skel qt;  (full polygon data)
//   Phase 2 — relation   → out center;              (centroid; full resolution too costly)
function buildOverpassQuery(
  filter: string,
  extraFilters: string[] | undefined,
  buildingFilter: string | undefined,
  radiusM: number,
  lat: number,
  lon: number,
): string {
  const around = `(around:${radiusM},${lat},${lon})`;

  const nwLines: string[]  = [`  node${filter}${around};`, `  way${filter}${around};`];
  const relLines: string[] = [`  relation${filter}${around};`];

  for (const f of extraFilters ?? []) {
    nwLines.push(`  node${f}${around};`);
    nwLines.push(`  way${f}${around};`);
    relLines.push(`  relation${f}${around};`);
  }
  if (buildingFilter) {
    nwLines.push(`  way${buildingFilter}${around};`);
    relLines.push(`  relation${buildingFilter}${around};`);
  }

  return [
    `[out:json][timeout:45];`,
    `(`, ...nwLines, `);`,
    `out body;`,
    `>;`,
    `out skel qt;`,
    `(`, ...relLines, `);`,
    `out center;`,
  ].join("\n");
}

function overpassGet(endpoint: string, query: string, ms: number): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
    .then((res) => {
      if (res.status === 429) throw new Error("rate-limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    });
}

async function fetchFromOverpass(
  category: AmenityKey,
  radiusM: number,
  lat: number,
  lon: number,
): Promise<ParsedAmenity[]> {
  const def   = AMENITY_DEF_MAP.get(category)!;
  const query = buildOverpassQuery(def.overpassFilter, def.extraFilters, def.buildingFilter, radiusM, lat, lon);
  let res: Response;
  try {
    res = await Promise.any(OVERPASS_ENDPOINTS.map((url) => overpassGet(url, query, 45_000)));
  } catch {
    throw new Error("all Overpass mirrors failed or timed out");
  }
  const data = await res.json() as { elements: unknown[] };
  return osmToAmenities(data as any, def.heightDefault);
}

/**
 * Fetch amenities for a category.
 *
 * Speed strategy:
 *  1. localStorage cache (instant on reload within 2h)
 *  2. Nominatim (fast ~1s) + Overpass (full tags ~3-8s) fired in parallel
 *  3. Nominatim results returned immediately; Overpass upgrades via onEnrich callback
 *  4. If Nominatim returns 0, wait for Overpass
 */
export async function fetchAmenities(
  category: AmenityKey,
  radiusM: number,
  lat: number,
  lon: number,
  onEnrich?: (enriched: ParsedAmenity[]) => void,
): Promise<ParsedAmenity[]> {
  const cacheKey = `${category}|${radiusM}|${lat.toFixed(3)}|${lon.toFixed(3)}`;

  // ── 1. Memory cache ────────────────────────────────────────────────────────
  const mem = memCache.get(cacheKey);
  if (mem) return mem;

  // ── 2. localStorage cache (survives reload) ────────────────────────────────
  const ls = lsRead(cacheKey);
  if (ls) { memCache.set(cacheKey, ls); return ls; }

  const def = AMENITY_DEF_MAP.get(category);
  if (!def) throw new Error(`Unknown amenity: ${category}`);

  const local = await searchLocalBuildingAmenities(category, radiusM, lat, lon)
    .catch(() => [] as ParsedAmenity[]);

  // ── 3. Fire Nominatim + Overpass in parallel ───────────────────────────────
  const nominatimPromise = (def.nominatimParams?.length
    ? nominatimSearch(def, radiusM, lat, lon)
    : Promise.resolve([] as ParsedAmenity[])
  ).catch(() => [] as ParsedAmenity[]);

  const overpassPromise = fetchFromOverpass(category, radiusM, lat, lon)
    .then((items) => applyLocalFootprintsToAmenities(category, items))
    .catch(() => [] as ParsedAmenity[]);

  // ── 4. Return Nominatim results immediately (fast path) ────────────────────
  const fast = await applyLocalFootprintsToAmenities(category, await nominatimPromise);

  if (local.length > 0 || fast.length > 0) {
    const initial = withinRadius(mergeAmenities(local, fast), lat, lon, radiusM);
    // Overpass runs in background; when it arrives, upgrade cache + notify panel
    overpassPromise.then((rich) => {
      const enriched = withinRadius(mergeAmenities(local, fast, rich), lat, lon, radiusM);
      if (rich.length === 0) {
        lsWrite(cacheKey, initial);
        return;
      }
      memCache.set(cacheKey, enriched);
      lsWrite(cacheKey, enriched);
      onEnrich?.(enriched);
    }).catch(() => {
      lsWrite(cacheKey, initial);
    });
    return initial;
  }

  // ── 5. Nominatim empty — wait for Overpass ────────────────────────────────
  const rich = await overpassPromise;
  if (rich.length > 0) {
    const enriched = withinRadius(mergeAmenities(local, rich), lat, lon, radiusM);
    memCache.set(cacheKey, enriched);
    lsWrite(cacheKey, enriched);
    return enriched;
  }

  throw new Error(`No ${def.label} found within ${radiusM / 1000} km`);
}

export function clearAmenityCache(): void {
  memCache.clear();
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(LS_PREFIX)) localStorage.removeItem(k);
  }
}
