// Battery sizing — a rule-of-thumb recommendation, not a load-study result.
// We have no household/building consumption profile, so this sizes a
// battery off the building's own generation (daily kWh), which is the only
// honest basis available. Every assumption is a named, editable input.

export const BATTERY_SIZES_KWH = [5, 10, 20, 40] as const;
export type BatterySizeKwh = (typeof BATTERY_SIZES_KWH)[number];

export interface BatteryAssumptions {
  /** Fraction of daily generation a battery should be sized to bank for evening/backup use. */
  targetCoverageFraction: number;
  /** Round-trip efficiency of charge/discharge. */
  roundTripEfficiency: number;
  /** Assumed average night-time load draw, used for backup-hours estimate. */
  assumedNightLoadKw: number;
}

export const DEFAULT_BATTERY_ASSUMPTIONS: BatteryAssumptions = {
  targetCoverageFraction: 0.35,
  roundTripEfficiency: 0.9,
  assumedNightLoadKw: 1.5,
};

export interface BatteryRecommendation {
  recommendedSizeKwh: BatterySizeKwh;
  backupHours: number;
  utilizationPct: number;
  expectedNightUsageKwh: number;
  selfConsumptionPct: number;
}

export function recommendBattery(
  dailyKwh: number,
  assumptions: BatteryAssumptions = DEFAULT_BATTERY_ASSUMPTIONS,
): BatteryRecommendation {
  const target = dailyKwh * assumptions.targetCoverageFraction;
  const recommendedSizeKwh =
    BATTERY_SIZES_KWH.find((size) => size >= target) ?? BATTERY_SIZES_KWH[BATTERY_SIZES_KWH.length - 1];

  const expectedNightUsageKwh = recommendedSizeKwh * assumptions.roundTripEfficiency;
  const backupHours = assumptions.assumedNightLoadKw > 0 ? expectedNightUsageKwh / assumptions.assumedNightLoadKw : 0;
  const utilizationPct = recommendedSizeKwh > 0 ? Math.min(100, (target / recommendedSizeKwh) * 100) : 0;
  // Self-consumption: fraction of daily generation the building can absorb
  // itself (rather than exporting to the grid) once battery-backed.
  const selfConsumptionPct = dailyKwh > 0 ? Math.min(95, ((dailyKwh - target) + expectedNightUsageKwh) / dailyKwh * 100) : 0;

  return {
    recommendedSizeKwh,
    backupHours: Math.round(backupHours * 10) / 10,
    utilizationPct: Math.round(utilizationPct),
    expectedNightUsageKwh: Math.round(expectedNightUsageKwh * 10) / 10,
    selfConsumptionPct: Math.round(selfConsumptionPct),
  };
}
