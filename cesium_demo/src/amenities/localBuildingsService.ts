import buildings5kmUrl from "../../geodata/export (1).geojson?url";
import { AmenityKey, AMENITY_DEF_MAP } from "./constants";
import { ParsedAmenity } from "./osmToGeojson";
import { haversine } from "./routingService";

type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

type GeoJsonFeature = {
  type: "Feature";
  properties?: Record<string, string | number | boolean | null>;
  geometry?: GeoJsonPolygon | GeoJsonMultiPolygon | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

let localBuildingsPromise: Promise<ParsedAmenity[]> | null = null;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function hasAny(tags: Record<string, string>, key: string, pattern: RegExp): boolean {
  return pattern.test(text(tags[key]).toLowerCase());
}

function matchesCategory(tags: Record<string, string>, category: AmenityKey): boolean {
  const name = text(tags.name).toLowerCase();

  switch (category) {
    case "hospital":
      return hasAny(tags, "amenity", /^(hospital|clinic|doctors|healthcare_centre)$/)
        || hasAny(tags, "healthcare", /^(hospital|clinic|centre)$/)
        || hasAny(tags, "building", /^(hospital|clinic|healthcare)$/)
        || /\b(hospital|clinic|health ?care|medical|ultrasound|heart care)\b/.test(name);

    case "school":
      return hasAny(tags, "amenity", /^(school|college|university|prep_school)$/)
        || hasAny(tags, "building", /^(school|college|university)$/)
        || /\b(school|college|university|vidyalaya|convent|institute|academy)\b/.test(name);

    case "restaurant":
      return hasAny(tags, "amenity", /^(restaurant|fast_food|cafe|food_court|juice_bar|ice_cream)$/)
        || /\b(restaurant|cafe|coffee|food|dhaba|sweet|sweets|bakery|pizza|burger)\b/.test(name);

    case "pharmacy":
      return hasAny(tags, "amenity", /^(pharmacy|chemist|doctors)$/)
        || hasAny(tags, "shop", /^chemist$/)
        || /\b(pharmacy|chemist|medical store)\b/.test(name);

    case "bank":
      return hasAny(tags, "amenity", /^bank$/)
        || /\b(bank|sbi|hdfc|icici|axis|pnb|canara|baroda|kotak)\b/.test(name);

    case "atm":
      return hasAny(tags, "amenity", /^atm$/)
        || /\b(atm)\b/.test(name);

    case "mall":
      return hasAny(tags, "shop", /^(mall|department_store)$/)
        || (hasAny(tags, "building", /^(retail|commercial)$/) && /\b(mall|plaza|square|market|shopping)\b/.test(name))
        || /\b(mall|plaza|square|shopping centre|shopping center|market)\b/.test(name);

    case "metro_station":
      return hasAny(tags, "station", /^subway$/)
        || (hasAny(tags, "railway", /^station$/) && hasAny(tags, "network", /(metro|delhi|mrts)/))
        || (hasAny(tags, "building", /^(train_station|transportation)$/) && hasAny(tags, "network", /(metro|delhi|mrts)/))
        || /\b(metro|delhi metro|mrt)\b/.test(name);

    case "parking":
      return hasAny(tags, "amenity", /^parking$/)
        || Boolean(tags.parking)
        || /\b(parking|car park)\b/.test(name);

    case "hotel":
      return hasAny(tags, "tourism", /^(hotel|guest_house|motel|hostel)$/)
        || hasAny(tags, "amenity", /^hotel$/)
        || hasAny(tags, "building", /^(hotel|hostel)$/)
        || /\b(hotel|hostel|guest house|motel|inn)\b/.test(name);

    case "fuel":
      return hasAny(tags, "amenity", /^fuel$/)
        || /\b(fuel|petrol|diesel|gas station|filling station)\b/.test(name);
  }
}

function resolveHeight(tags: Record<string, string>, fallback: number): number {
  const height = parseFloat(text(tags.height));
  if (Number.isFinite(height) && height > 0) return height;

  const levels = parseFloat(text(tags["building:levels"]));
  if (Number.isFinite(levels) && levels > 0) return Math.round(levels * 3.5);

  return fallback;
}

function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(area / 2);
}

function outerRing(geometry: GeoJsonPolygon | GeoJsonMultiPolygon): [number, number][] | null {
  const rings = geometry.type === "Polygon"
    ? [geometry.coordinates[0]]
    : geometry.coordinates.map((polygon) => polygon[0]);

  const ring = rings
    .filter((candidate) => candidate.length >= 4)
    .sort((a, b) => ringArea(b) - ringArea(a))[0];

  if (!ring) return null;
  return ring.map(([lon, lat]) => [lon, lat]);
}

function centroid(coords: [number, number][]): { lat: number; lon: number } {
  const unique = coords.length > 1
    && coords[0][0] === coords[coords.length - 1][0]
    && coords[0][1] === coords[coords.length - 1][1]
    ? coords.slice(0, -1)
    : coords;

  const sum = unique.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lat: 0, lon: 0 },
  );

  return { lat: sum.lat / unique.length, lon: sum.lon / unique.length };
}

function footprintRadiusM(coords: [number, number][]): number {
  const center = centroid(coords);
  return coords.reduce(
    (max, [lon, lat]) => Math.max(max, haversine(center.lat, center.lon, lat, lon)),
    0,
  );
}

function categorySnapRadius(category: AmenityKey): number {
  switch (category) {
    case "hospital":
    case "school":
    case "mall":
    case "hotel":
    case "metro_station":
      return 180;
    case "parking":
    case "fuel":
      return 120;
    default:
      return 80;
  }
}

function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3 && !["the", "and", "public", "building"].includes(token)),
  );
}

function tokenOverlap(a: string, b: string): number {
  const left = nameTokens(a);
  const right = nameTokens(b);
  let count = 0;
  left.forEach((token) => {
    if (right.has(token)) count += 1;
  });
  return count;
}

async function loadLocalBuildings(): Promise<ParsedAmenity[]> {
  if (!localBuildingsPromise) {
    localBuildingsPromise = fetch(buildings5kmUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<GeoJsonFeatureCollection>;
      })
      .then((data) => data.features.flatMap((feature, index): ParsedAmenity[] => {
        const geometry = feature.geometry;
        if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return [];

        const coords = outerRing(geometry);
        if (!coords) return [];

        const tags = Object.fromEntries(
          Object.entries(feature.properties ?? {}).map(([key, value]) => [key, text(value)]),
        );
        const center = centroid(coords);
        const name = tags.name || tags.brand || tags.operator || tags.amenity || tags.shop || tags.building || "Building";
        const id = `local-building-${tags["@id"] || index}`;

        return [{
          id,
          name,
          lat: center.lat,
          lon: center.lon,
          tags,
          geom: { type: "Polygon", coords },
          height: resolveHeight(tags, 12),
        }];
      }));
  }

  return localBuildingsPromise;
}

export async function searchLocalBuildingAmenities(
  category: AmenityKey,
  radiusM: number,
  lat: number,
  lon: number,
): Promise<ParsedAmenity[]> {
  const def = AMENITY_DEF_MAP.get(category);
  if (!def) return [];

  const buildings = await loadLocalBuildings();
  return buildings
    .filter((building) => matchesCategory(building.tags, category))
    .map((building) => ({
      ...building,
      height: resolveHeight(building.tags, def.heightDefault),
      _dist: haversine(lat, lon, building.lat, building.lon),
    } as ParsedAmenity & { _dist: number }))
    .filter((building) => building._dist <= radiusM)
    .sort((a, b) => a._dist - b._dist);
}

export async function applyLocalFootprintsToAmenities(
  category: AmenityKey,
  amenities: ParsedAmenity[],
): Promise<ParsedAmenity[]> {
  if (amenities.length === 0) return amenities;

  const buildings = await loadLocalBuildings();
  const snapRadius = categorySnapRadius(category);

  return amenities.map((amenity) => {
    if (amenity.geom.type === "Polygon") return amenity;

    let best: { building: ParsedAmenity; score: number } | null = null;

    for (const building of buildings) {
      if (building.geom.type !== "Polygon") continue;

      const distance = haversine(amenity.lat, amenity.lon, building.lat, building.lon);
      const footprintRadius = footprintRadiusM(building.geom.coords);
      if (distance > snapRadius + footprintRadius) continue;

      const tagMatch = matchesCategory(building.tags, category) ? 140 : 0;
      const nameMatch = tokenOverlap(amenity.name, building.name) * 80;
      const sizeBonus = Math.min(footprintRadius, 80) * 0.35;
      const score = tagMatch + nameMatch + sizeBonus - distance;

      if (!best || score > best.score) {
        best = { building, score };
      }
    }

    if (!best || best.score < -40 || best.building.geom.type !== "Polygon") return amenity;

    return {
      ...amenity,
      lat: best.building.lat,
      lon: best.building.lon,
      tags: { ...best.building.tags, ...amenity.tags },
      geom: best.building.geom,
      height: Math.max(amenity.height, best.building.height),
    };
  });
}
