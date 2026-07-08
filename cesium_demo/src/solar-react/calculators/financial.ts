// Financial estimate — installation cost, subsidy, payback, ROI, IRR.
//
// Subsidy is computed from the real PM Surya Ghar + Delhi state scheme rules
// (see solarSubsidy.ts, sourced from pmsuryaghar.gov.in / solar.delhi.gov.in,
// checked July 2026) rather than a guessed percentage. Tariff and price/watt
// default to current BSES Delhi tariffs and 2026 market installed-cost
// ranges — still editable, since exact billing depends on consumption slab,
// PPAC surcharge (revised monthly), and negotiated installer pricing that
// this app has no way to know for a specific building.

import { BuildingUsageType, computeDelhiSolarSubsidy, DEFAULT_PRICE_PER_WATT, DEFAULT_TARIFF_PER_KWH } from "./solarSubsidy";

export interface FinancialAssumptions {
  /** Installed panel rating density, used to turn usable roof area into a capacity figure. */
  panelDensityKwPerM2: number;
  /** Residential (PM Surya Ghar + Delhi top-up eligible) vs commercial (no scheme subsidy). */
  usageType: BuildingUsageType;
  /** All-in installed cost per watt (before subsidy), in the local currency. */
  pricePerWatt: number;
  /** Retail electricity tariff, local currency per kWh. */
  tariffPerKwh: number;
  /** Annual panel output degradation. */
  annualDegradation: number;
  /** Annual O&M cost, local currency. */
  annualMaintenanceCost: number;
  /** Discount rate used for IRR/NPV-style comparison. */
  discountRate: number;
  /** Analysis horizon in years. */
  horizonYears: number;
}

export const DEFAULT_FINANCIAL_ASSUMPTIONS: FinancialAssumptions = {
  panelDensityKwPerM2: 0.165,
  usageType: "residential",
  pricePerWatt: DEFAULT_PRICE_PER_WATT.residential,
  tariffPerKwh: DEFAULT_TARIFF_PER_KWH.residential,
  annualDegradation: 0.005,
  annualMaintenanceCost: 1500,
  discountRate: 0.08,
  horizonYears: 25,
};

export interface FinancialEstimate {
  capacityKw: number;
  installationCost: number;
  centralSubsidy: number;
  stateSubsidy: number;
  subsidyAmount: number;
  subsidyNote: string;
  netInvestment: number;
  annualSavingsYear1: number;
  paybackYears: number | null;
  horizonSavings: number;
  roiPct: number | null;
  irrPct: number | null;
  npvAtDiscountRate: number;
}

function cashFlowSeries(
  netInvestment: number,
  annualSavingsYear1: number,
  a: FinancialAssumptions,
): number[] {
  const flows = [-netInvestment];
  for (let year = 1; year <= a.horizonYears; year++) {
    const degraded = annualSavingsYear1 * Math.pow(1 - a.annualDegradation, year - 1);
    flows.push(degraded - a.annualMaintenanceCost);
  }
  return flows;
}

function npv(rate: number, flows: number[]): number {
  return flows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/** Bisection IRR solver — cash flows are well-behaved (one sign change), so this converges reliably without a numerical library. */
function solveIrr(flows: number[]): number | null {
  let lo = -0.99, hi = 5;
  let npvLo = npv(lo, flows), npvHi = npv(hi, flows);
  if (npvLo * npvHi > 0) return null; // no sign change in range — can't bracket a root

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid, flows);
    if (Math.abs(npvMid) < 1e-6) return mid;
    if (npvLo * npvMid < 0) { hi = mid; npvHi = npvMid; } else { lo = mid; npvLo = npvMid; }
  }
  return (lo + hi) / 2;
}

export function estimateFinancials(
  usableAreaM2: number,
  annualKwh: number,
  assumptions: FinancialAssumptions = DEFAULT_FINANCIAL_ASSUMPTIONS,
): FinancialEstimate {
  const capacityKw = usableAreaM2 * assumptions.panelDensityKwPerM2;
  const installationCost = capacityKw * 1000 * assumptions.pricePerWatt;

  const subsidy = computeDelhiSolarSubsidy(capacityKw, assumptions.usageType);
  const subsidyAmount = Math.min(subsidy.totalSubsidy, installationCost);
  const netInvestment = installationCost - subsidyAmount;
  const annualSavingsYear1 = annualKwh * assumptions.tariffPerKwh;

  const paybackYears = annualSavingsYear1 > 0 ? netInvestment / annualSavingsYear1 : null;

  const flows = cashFlowSeries(netInvestment, annualSavingsYear1, assumptions);
  const horizonSavings = flows.slice(1).reduce((s, v) => s + v, 0);
  const roiPct = netInvestment > 0 ? (horizonSavings / netInvestment) * 100 : null;
  const irr = solveIrr(flows);
  const npvAtDiscountRate = npv(assumptions.discountRate, flows);

  return {
    capacityKw: Math.round(capacityKw * 100) / 100,
    installationCost: Math.round(installationCost),
    centralSubsidy: subsidy.centralSubsidy,
    stateSubsidy: subsidy.stateSubsidy,
    subsidyAmount: Math.round(subsidyAmount),
    subsidyNote: subsidy.note,
    netInvestment: Math.round(netInvestment),
    annualSavingsYear1: Math.round(annualSavingsYear1),
    paybackYears: paybackYears !== null ? Math.round(paybackYears * 10) / 10 : null,
    horizonSavings: Math.round(horizonSavings),
    roiPct: roiPct !== null ? Math.round(roiPct) : null,
    irrPct: irr !== null ? Math.round(irr * 1000) / 10 : null,
    npvAtDiscountRate: Math.round(npvAtDiscountRate),
  };
}
