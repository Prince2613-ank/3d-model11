import SunCalc from "suncalc";
import { OSMProvider } from "../providers/OSMProvider";
import { BuildingFootprint } from "../providers/IFootprintProvider";
import { solarPrecomputedRepository, PrecomputedSolarRow } from "../repositories/solarPrecomputedRepository";

const provider = new OSMProvider();

export type SolarMode = "free" | "google";
export type SolarDatasetOrigin = "live" | "precomputed";

export interface SolarBuildingEstimate {
  id: string;
  externalId: string | null;
  name: string | null;
  centroid: { lat: number; lon: number };
  areaSqm: number | null;
  height: number;
  geojson: GeoJSON.Geometry;
  usableAreaM2: number;
  irradianceKwhM2Day: number;
  shadingFactor: number | null;
  dailyKwh: number;
  annualKwh: number;
  suitability: "excellent" | "good" | "fair" | "poor";
  source: SolarMode;
}

export interface SolarAreaEstimate {
  mode: SolarMode;
  date: string;
  datasetOrigin: SolarDatasetOrigin;
  sun: { elevationDeg: number; azimuthDeg: number };
  /** NASA POWER long-term monthly-average irradiance (kWh/m²/day), Jan..Dec, for this bbox's centroid — real data, exposed as-is so the frontend can derive seasonal charts without re-deriving the estimator's constants. */
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

// System-level assumptions, consistent with typical rooftop PV cadaster tools
// (e.g. UMEP/SEBE-based studies) since we don't have per-roof panel layout data.
const PANEL_EFFICIENCY   = 0.20; // modern mono-crystalline panel
const PERFORMANCE_RATIO  = 0.80; // inverter + wiring + soiling + temperature losses
const ROOF_PACKING_FACTOR = 0.70; // usable fraction of roof after setbacks/HVAC/orientation

const MONTH_KEYS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAYS_IN_MONTH = [31,28,31,30,31,30,31,31,30,31,30,31];

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function suitabilityOf(specificYieldKwhM2Day: number): SolarBuildingEstimate["suitability"] {
  if (specificYieldKwhM2Day >= 1.0) return "excellent";
  if (specificYieldKwhM2Day >= 0.7) return "good";
  if (specificYieldKwhM2Day >= 0.4) return "fair";
  return "poor";
}

// ── NASA POWER (free/open-data) ──────────────────────────────────────────────

const POWER_BASE = "https://power.larc.nasa.gov/api/temporal";

async function fetchClimatologyMonthly(lat: number, lon: number): Promise<{ monthly: number[]; annual: number }> {
  const url =
    `${POWER_BASE}/climatology/point` +
    `?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER climatology request failed (${res.status})`);
  const data = await res.json() as any;
  const p = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN;
  if (!p) throw new Error("NASA POWER climatology response missing irradiance data");
  const monthly = MONTH_KEYS.map((k) => Number(p[k]));
  const annual = Number(p["ANN"]) || monthly.reduce((s, v) => s + v, 0) / 12;
  return { monthly, annual };
}

async function fetchDailyIrradiance(lat: number, lon: number, date: Date): Promise<number | null> {
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const url =
    `${POWER_BASE}/daily/point` +
    `?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lon}&latitude=${lat}&start=${ymd}&end=${ymd}&format=JSON`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as any;
    const val = data?.properties?.parameter?.ALLSKY_SFC_SW_DWN?.[ymd];
    if (val === undefined || val === -999) return null;
    return Number(val);
  } catch {
    return null;
  }
}

/**
 * Crude self-shading proxy: without a DSM, approximate obstruction by looking
 * at the tallest neighbor within 15m of each building's centroid. The taller
 * the neighbor and the lower the sun sits at solar noon, the bigger the
 * discount. This is a heuristic, not a ray-traced shadow model.
 */
function computeShadingFactors(buildings: { centroid: { lat: number; lon: number }; height: number }[], sunElevationDeg: number): number[] {
  const elevationRad = (Math.max(sunElevationDeg, 1) * Math.PI) / 180;
  const shadeSuppression = Math.max(0, 1 - Math.sin(elevationRad)); // 0 (high sun) .. 1 (low sun)

  return buildings.map((b) => {
    let tallestNeighbor = 0;
    for (const other of buildings) {
      if (other === b) continue;
      const d = haversineM(b.centroid.lat, b.centroid.lon, other.centroid.lat, other.centroid.lon);
      if (d <= 15 && other.height > tallestNeighbor) tallestNeighbor = other.height;
    }
    const extraHeight = Math.max(0, tallestNeighbor - b.height);
    const factor = (extraHeight / 10) * shadeSuppression * 0.5;
    return Math.min(0.5, Math.max(0, factor));
  });
}

async function estimateFree(
  buildings: BuildingFootprint[],
  date: Date,
): Promise<{ estimates: SolarBuildingEstimate[]; sun: { elevationDeg: number; azimuthDeg: number }; monthly: number[] }> {
  if (buildings.length === 0) return { estimates: [], sun: { elevationDeg: 0, azimuthDeg: 0 }, monthly: [] };

  // One irradiance lookup per area (NASA POWER resolution is ~1° anyway) —
  // use the bbox centroid rather than calling per-building.
  const centroidLat = buildings.reduce((s, b) => s + b.centroid.lat, 0) / buildings.length;
  const centroidLon = buildings.reduce((s, b) => s + b.centroid.lon, 0) / buildings.length;

  const { monthly, annual } = await fetchClimatologyMonthly(centroidLat, centroidLon);

  // Only attempt the daily (actuals) endpoint for dates that are safely in
  // the past — POWER's daily product lags real time by a few days and has
  // no data at all for future dates.
  const daysAgo = (Date.now() - date.getTime()) / 86_400_000;
  const dailyActual = daysAgo > 3 ? await fetchDailyIrradiance(centroidLat, centroidLon, date) : null;

  const monthIndex = date.getMonth();
  const irradianceKwhM2Day = dailyActual ?? monthly[monthIndex] ?? annual;

  const solarNoon = SunCalc.getTimes(date, centroidLat, centroidLon).solarNoon;
  const pos = SunCalc.getPosition(solarNoon, centroidLat, centroidLon);
  const elevationDeg = (pos.altitude * 180) / Math.PI;
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360; // SunCalc azimuth is measured from south

  const shadingFactors = computeShadingFactors(buildings, elevationDeg);

  const estimates: SolarBuildingEstimate[] = buildings.map((b, i) => {
    const usableAreaM2 = (b.areaSqm ?? 0) * ROOF_PACKING_FACTOR;
    const shadingFactor = shadingFactors[i];
    const yieldFactor = PANEL_EFFICIENCY * PERFORMANCE_RATIO * (1 - shadingFactor);

    const dailyKwh = irradianceKwhM2Day * usableAreaM2 * yieldFactor;
    const annualKwh = annual * 365 * usableAreaM2 * yieldFactor;
    const specificYield = usableAreaM2 > 0 ? dailyKwh / usableAreaM2 : 0;

    return {
      id: b.id,
      externalId: b.externalId,
      name: b.name,
      centroid: b.centroid,
      areaSqm: b.areaSqm,
      height: b.height,
      geojson: b.geojson,
      usableAreaM2: Math.round(usableAreaM2 * 10) / 10,
      irradianceKwhM2Day: Math.round(irradianceKwhM2Day * 100) / 100,
      shadingFactor: Math.round(shadingFactor * 100) / 100,
      dailyKwh: Math.round(dailyKwh * 10) / 10,
      annualKwh: Math.round(annualKwh),
      suitability: suitabilityOf(specificYield),
      source: "free",
    };
  });

  return { estimates, sun: { elevationDeg: Math.round(elevationDeg * 10) / 10, azimuthDeg: Math.round(azimuthDeg * 10) / 10 }, monthly };
}

// ── Precomputed dataset (third-party bulk export, May only) ──────────────────
// ── Precomputed dataset (third-party bulk export) ──────────────────

async function estimatePrecomputed(
  rows: PrecomputedSolarRow[],
  date: Date,
): Promise<{ estimates: SolarBuildingEstimate[]; sun: { elevationDeg: number; azimuthDeg: number }; monthly: number[] }> {
  const centroidLat = rows.reduce((s, r) => s + r.centroid.lat, 0) / rows.length;
  const centroidLon = rows.reduce((s, r) => s + r.centroid.lon, 0) / rows.length;

  const { monthly, annual } = await fetchClimatologyMonthly(centroidLat, centroidLon);

  const solarNoon = SunCalc.getTimes(date, centroidLat, centroidLon).solarNoon;
  const pos = SunCalc.getPosition(solarNoon, centroidLat, centroidLon);
  const elevationDeg = (pos.altitude * 180) / Math.PI;
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;

  const daysAgo = (Date.now() - date.getTime()) / 86_400_000;
  const dailyActual = daysAgo > 3 ? await fetchDailyIrradiance(centroidLat, centroidLon, date) : null;
  const monthIndex = date.getMonth();
  const irradianceKwhM2Day = dailyActual ?? monthly[monthIndex] ?? annual;

  // Run shadow model dynamically using the precomputed buildings and their matched heights
  const shadingFactors = computeShadingFactors(rows, elevationDeg);

  const estimates: SolarBuildingEstimate[] = rows.map((r, i) => {
    const usableAreaM2 = r.usableAreaM2 ?? (r.areaSqm ?? 0) * ROOF_PACKING_FACTOR;
    const shadingFactor = shadingFactors[i];
    const yieldFactor = PANEL_EFFICIENCY * PERFORMANCE_RATIO * (1 - shadingFactor);

    const dailyKwh = irradianceKwhM2Day * usableAreaM2 * yieldFactor;
    const annualKwh = annual * 365 * usableAreaM2 * yieldFactor;
    const specificYield = usableAreaM2 > 0 ? dailyKwh / usableAreaM2 : 0;

    return {
      id: r.id,
      externalId: r.externalId,
      name: null,
      centroid: r.centroid,
      areaSqm: r.areaSqm,
      height: r.height,
      geojson: r.geojson,
      usableAreaM2: Math.round(usableAreaM2 * 10) / 10,
      irradianceKwhM2Day: Math.round(irradianceKwhM2Day * 100) / 100,
      shadingFactor: Math.round(shadingFactor * 100) / 100,
      dailyKwh: Math.round(dailyKwh * 10) / 10,
      annualKwh: Math.round(annualKwh),
      suitability: r.suitability ?? suitabilityOf(specificYield),
      source: "free",
    };
  });

  return { estimates, sun: { elevationDeg: Math.round(elevationDeg * 10) / 10, azimuthDeg: Math.round(azimuthDeg * 10) / 10 }, monthly };
}

// ── Google Solar API (paid) ───────────────────────────────────────────────────

async function estimateGoogleForBuilding(
  b: BuildingFootprint,
  apiKey: string,
  monthlyShape: number[],
  date: Date,
): Promise<SolarBuildingEstimate | null> {
  const url =
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${b.centroid.lat}&location.longitude=${b.centroid.lon}` +
    `&requiredQuality=LOW&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) return null; // no coverage / not found at this location

  const data = await res.json() as any;
  const sp = data?.solarPotential;
  if (!sp) return null;

  const configs = sp.solarPanelConfigs ?? [];
  const best = configs.length ? configs[configs.length - 1] : null;
  const annualKwh: number = best?.yearlyEnergyDcKwh ?? 0;
  const usableAreaM2: number = sp.wholeRoofStats?.areaMeters2 ?? (b.areaSqm ?? 0) * ROOF_PACKING_FACTOR;

  // Google's JSON insights only return an annual total, not a per-date figure.
  // Shape the annual total across the year using NASA POWER's monthly
  // irradiance profile so the "selected date" still reflects seasonal variation.
  const shapeSum = monthlyShape.reduce((s, v) => s + v, 0) || 1;
  const monthIndex = date.getMonth();
  const monthShare = (monthlyShape[monthIndex] * DAYS_IN_MONTH[monthIndex]) /
    monthlyShape.reduce((s, v, i) => s + v * DAYS_IN_MONTH[i], 0);
  const dailyKwh = (annualKwh * monthShare) / DAYS_IN_MONTH[monthIndex];
  const specificYield = usableAreaM2 > 0 ? dailyKwh / usableAreaM2 : 0;

  return {
    id: b.id,
    externalId: b.externalId,
    name: b.name,
    centroid: b.centroid,
    areaSqm: b.areaSqm,
    height: b.height,
    geojson: b.geojson,
    usableAreaM2: Math.round(usableAreaM2 * 10) / 10,
    irradianceKwhM2Day: Math.round((shapeSum / 12) * 100) / 100,
    shadingFactor: 0, // Google's own imagery-based model already accounts for shading
    dailyKwh: Math.round(dailyKwh * 10) / 10,
    annualKwh: Math.round(annualKwh),
    suitability: suitabilityOf(specificYield),
    source: "google",
  };
}

const GOOGLE_BATCH_LIMIT = 25; // paid API — cap per-request cost

async function estimateGoogle(
  buildings: BuildingFootprint[],
  date: Date,
): Promise<{ estimates: SolarBuildingEstimate[]; notCovered: number; sun: { elevationDeg: number; azimuthDeg: number }; monthly: number[] }> {
  const apiKey = process.env.GOOGLE_SOLAR_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_SOLAR_API_KEY is not configured on the server");

  const batch = buildings.slice(0, GOOGLE_BATCH_LIMIT);
  const centroidLat = batch.reduce((s, b) => s + b.centroid.lat, 0) / (batch.length || 1);
  const centroidLon = batch.reduce((s, b) => s + b.centroid.lon, 0) / (batch.length || 1);

  const { monthly } = await fetchClimatologyMonthly(centroidLat, centroidLon);
  const solarNoon = SunCalc.getTimes(date, centroidLat, centroidLon).solarNoon;
  const pos = SunCalc.getPosition(solarNoon, centroidLat, centroidLon);
  const elevationDeg = (pos.altitude * 180) / Math.PI;
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;

  const results = await Promise.all(batch.map((b) => estimateGoogleForBuilding(b, apiKey, monthly, date)));
  const estimates = results.filter((r): r is SolarBuildingEstimate => r !== null);

  return {
    estimates,
    notCovered: batch.length - estimates.length,
    sun: { elevationDeg: Math.round(elevationDeg * 10) / 10, azimuthDeg: Math.round(azimuthDeg * 10) / 10 },
    monthly,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export const solarService = {
  async estimateArea(
    minLon: number, minLat: number, maxLon: number, maxLat: number,
    dateStr: string, mode: SolarMode,
  ): Promise<SolarAreaEstimate> {
    const date = new Date(`${dateStr}T12:00:00Z`);
    if (isNaN(date.getTime())) throw new Error("Invalid date");

    let estimates: SolarBuildingEstimate[];
    let notCovered = 0;
    let sun: { elevationDeg: number; azimuthDeg: number };
    let monthly: number[] = [];
    let warning: string | undefined;
    let datasetOrigin: SolarDatasetOrigin = "live";

    if (mode === "google") {
      const buildings = await provider.getByBbox(minLon, minLat, maxLon, maxLat);
      const withArea = buildings.filter((b) => (b.areaSqm ?? 0) > 0);
      const result = await estimateGoogle(withArea, date);
      estimates = result.estimates;
      notCovered = result.notCovered;
      sun = result.sun;
      monthly = result.monthly;
      if (withArea.length > GOOGLE_BATCH_LIMIT) {
        warning = `Google Solar API is billed per lookup — only the first ${GOOGLE_BATCH_LIMIT} of ${withArea.length} buildings were queried.`;
      }
      if (notCovered > 0) {
        const msg = `${notCovered} building(s) have no Google Solar API coverage at this location.`;
        warning = warning ? `${warning} ${msg}` : msg;
      }
    } else {
      // Always fetch live building footprints and compute solar metrics dynamically
      // using the NASA POWER API for irradiance + SunCalc for sun position + neighbor shading model.
      const buildings = await provider.getByBbox(minLon, minLat, maxLon, maxLat);
      const withArea = buildings.filter((b) => (b.areaSqm ?? 0) > 0);
      const result = await estimateFree(withArea, date);
      estimates = result.estimates;
      sun = result.sun;
      monthly = result.monthly;
    }

    const totalDailyKwh = estimates.reduce((s, e) => s + e.dailyKwh, 0);
    const totalAnnualKwh = estimates.reduce((s, e) => s + e.annualKwh, 0);
    const avgIrradianceKwhM2Day =
      estimates.length > 0 ? estimates.reduce((s, e) => s + e.irradianceKwhM2Day, 0) / estimates.length : 0;

    return {
      mode,
      date: dateStr,
      datasetOrigin,
      sun,
      monthlyIrradianceKwhM2Day: monthly.map((v) => Math.round(v * 100) / 100),
      buildings: estimates,
      summary: {
        count: estimates.length,
        notCovered,
        totalDailyKwh: Math.round(totalDailyKwh * 10) / 10,
        totalAnnualKwh: Math.round(totalAnnualKwh),
        avgIrradianceKwhM2Day: Math.round(avgIrradianceKwhM2Day * 100) / 100,
      },
      warning,
    };
  },
};
