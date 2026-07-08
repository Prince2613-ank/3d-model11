// CO2 savings estimate — a single published conversion factor applied to
// real annual kWh already computed by the backend. Not a new calculation
// engine, just one multiplication with a documented, editable factor.

// India grid emission factor (combined margin), CEA CO2 Baseline Database —
// varies ~0.79-0.92 kgCO2/kWh by year/version; 0.82 is a commonly cited value.
export const DEFAULT_GRID_EMISSION_FACTOR_KG_PER_KWH = 0.82;

// One mature tree absorbs roughly 21kg CO2/year (widely cited EPA figure).
const CO2_KG_PER_TREE_PER_YEAR = 21;

export interface Co2Estimate {
  annualCo2SavedKg: number;
  equivalentTreesPerYear: number;
}

export function estimateCo2(
  annualKwh: number,
  emissionFactorKgPerKwh = DEFAULT_GRID_EMISSION_FACTOR_KG_PER_KWH,
): Co2Estimate {
  const annualCo2SavedKg = annualKwh * emissionFactorKgPerKwh;
  return {
    annualCo2SavedKg: Math.round(annualCo2SavedKg),
    equivalentTreesPerYear: Math.round(annualCo2SavedKg / CO2_KG_PER_TREE_PER_YEAR),
  };
}
