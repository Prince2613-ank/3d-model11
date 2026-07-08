// Aggregates the current analysis's buildings into community-level totals.
// Pure aggregation of numbers the backend already computed — the only new
// assumption here is the "equivalent homes powered" conversion factor.

import { SolarBuildingEstimate } from "../../solar/solarService";
import { estimateCo2 } from "./co2";
import { estimateFinancials, DEFAULT_FINANCIAL_ASSUMPTIONS } from "./financial";
import { Suitability } from "../types";

// Delhi's average electrified household consumes ~250-270 kWh/month
// (~3,000-3,240 kWh/year) — notably above the ~1,176 kWh/year national
// average, per Prayas Energy Group / Kleinman Center research (cited July
// 2026). Used only for the "equivalent homes powered" comparison.
export const DELHI_AVG_HOUSEHOLD_ANNUAL_KWH = 3_000;

export interface CommunitySummary {
  buildingCount: number;
  totalRoofAreaM2: number;
  totalUsableRoofM2: number;
  totalDailyKwh: number;
  totalAnnualKwh: number;
  avgSolarScore: number;
  avgRoiPct: number | null;
  totalCo2SavedTons: number;
  equivalentTrees: number;
  equivalentHomesPowered: number;
  suitabilityCounts: Record<Suitability, number>;
}

const SUITABILITY_SCORE: Record<Suitability, number> = { excellent: 90, good: 70, fair: 50, poor: 25 };

export function summarizeCommunity(buildings: SolarBuildingEstimate[]): CommunitySummary {
  const suitabilityCounts: Record<Suitability, number> = { excellent: 0, good: 0, fair: 0, poor: 0 };
  let totalRoofAreaM2 = 0, totalUsableRoofM2 = 0, totalDailyKwh = 0, totalAnnualKwh = 0, scoreSum = 0, roiSum = 0, roiCount = 0;

  for (const b of buildings) {
    suitabilityCounts[b.suitability]++;
    totalRoofAreaM2 += b.areaSqm ?? 0;
    totalUsableRoofM2 += b.usableAreaM2;
    totalDailyKwh += b.dailyKwh;
    totalAnnualKwh += b.annualKwh;
    scoreSum += SUITABILITY_SCORE[b.suitability];

    const fin = estimateFinancials(b.usableAreaM2, b.annualKwh, DEFAULT_FINANCIAL_ASSUMPTIONS);
    if (fin.roiPct !== null) { roiSum += fin.roiPct; roiCount++; }
  }

  const co2 = estimateCo2(totalAnnualKwh);

  return {
    buildingCount: buildings.length,
    totalRoofAreaM2: Math.round(totalRoofAreaM2),
    totalUsableRoofM2: Math.round(totalUsableRoofM2),
    totalDailyKwh: Math.round(totalDailyKwh * 10) / 10,
    totalAnnualKwh: Math.round(totalAnnualKwh),
    avgSolarScore: buildings.length > 0 ? Math.round(scoreSum / buildings.length) : 0,
    avgRoiPct: roiCount > 0 ? Math.round(roiSum / roiCount) : null,
    totalCo2SavedTons: Math.round((co2.annualCo2SavedKg / 1000) * 10) / 10,
    equivalentTrees: co2.equivalentTreesPerYear,
    equivalentHomesPowered: Math.round(totalAnnualKwh / DELHI_AVG_HOUSEHOLD_ANNUAL_KWH),
    suitabilityCounts,
  };
}
