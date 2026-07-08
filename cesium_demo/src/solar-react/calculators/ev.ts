// EV charging capacity — derived purely from the building's own daily kWh
// surplus after an assumed self-use share. No real EV/charger inventory
// exists for these buildings, so every input here is a labeled, editable
// assumption rather than a measured fact.

export const CHARGER_TIERS_KW = [3, 7, 22, 50] as const;
export type ChargerTierKw = (typeof CHARGER_TIERS_KW)[number];

export interface EvAssumptions {
  /** Fraction of daily generation assumed available for EV charging (rest covers building load). */
  surplusFraction: number;
  /** Average energy drawn per charging session. */
  avgSessionKwh: number;
  /** Assumed peak sun hours/day used to convert daily kWh into a sustained kW figure. */
  peakSunHours: number;
}

export const DEFAULT_EV_ASSUMPTIONS: EvAssumptions = {
  surplusFraction: 0.4,
  avgSessionKwh: 20, // a partial top-up charge, not a full 0-100% battery fill
  peakSunHours: 5,
};

export interface EvEstimate {
  carsPerDay: number;
  sessionsPerDay: number;
  chargingEnergyKwh: number;
  recommendedChargerKw: ChargerTierKw;
}

export function estimateEvCapacity(
  dailyKwh: number,
  assumptions: EvAssumptions = DEFAULT_EV_ASSUMPTIONS,
): EvEstimate {
  const chargingEnergyKwh = dailyKwh * assumptions.surplusFraction;
  const sessionsPerDay = assumptions.avgSessionKwh > 0 ? chargingEnergyKwh / assumptions.avgSessionKwh : 0;

  const sustainedKw = assumptions.peakSunHours > 0 ? chargingEnergyKwh / assumptions.peakSunHours : 0;
  const recommendedChargerKw =
    [...CHARGER_TIERS_KW].reverse().find((tier) => tier <= sustainedKw) ?? CHARGER_TIERS_KW[0];

  return {
    carsPerDay: Math.round(sessionsPerDay),
    sessionsPerDay: Math.round(sessionsPerDay * 10) / 10,
    chargingEnergyKwh: Math.round(chargingEnergyKwh * 10) / 10,
    recommendedChargerKw,
  };
}
