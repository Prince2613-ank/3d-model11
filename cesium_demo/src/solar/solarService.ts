import { SOLAR_API_BASE, SolarMode } from "./constants";

export interface SolarBuildingEstimate {
  id: string;
  externalId: string | null;
  name: string | null;
  centroid: { lat: number; lon: number };
  areaSqm: number | null;
  height: number;
  geojson: { type: "Polygon" | "MultiPolygon"; coordinates: any };
  usableAreaM2: number;
  irradianceKwhM2Day: number;
  shadingFactor: number | null;
  dailyKwh: number;
  annualKwh: number;
  suitability: "excellent" | "good" | "fair" | "poor";
  source: SolarMode;
}

export type SolarDatasetOrigin = "live" | "precomputed";

export interface SolarAreaEstimate {
  mode: SolarMode;
  date: string;
  datasetOrigin: SolarDatasetOrigin;
  sun: { elevationDeg: number; azimuthDeg: number };
  monthlyIrradianceKwhM2Day: number[];
  buildings: SolarBuildingEstimate[];
  summary: {
    count: number;
    notCovered: number;
    totalDailyKwh: number;
    totalAnnualKwh: number;
    avgIrradianceKwhM2Day: number;
  };
  warning?: string;
}

export interface BBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function fetchSolarEstimate(
  bbox: BBox,
  dateStr: string,
  mode: SolarMode,
): Promise<SolarAreaEstimate> {
  const url =
    `${SOLAR_API_BASE}/estimate` +
    `?minLon=${bbox.minLon}&minLat=${bbox.minLat}&maxLon=${bbox.maxLon}&maxLat=${bbox.maxLat}` +
    `&date=${dateStr}&mode=${mode}`;

  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Solar estimate failed (${res.status})`);
  return data as SolarAreaEstimate;
}

/** Builds a square bbox (in degrees) around a center point given a half-width in metres. */
export function bboxAround(lat: number, lon: number, halfWidthM: number): BBox {
  const dLat = halfWidthM / 111_320;
  const dLon = halfWidthM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    minLon: lon - dLon,
    minLat: lat - dLat,
    maxLon: lon + dLon,
    maxLat: lat + dLat,
  };
}
