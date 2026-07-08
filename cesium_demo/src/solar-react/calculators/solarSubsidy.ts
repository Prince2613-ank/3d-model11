// Real, sourced government subsidy rules for rooftop solar in Delhi, as of
// July 2026. Government schemes change — these are defaults the user can
// still override, not hardcoded truths, but they're grounded in the actual
// published scheme rules rather than an arbitrary percentage.
//
// Sources (checked July 2026):
// - PM Surya Ghar Muft Bijli Yojana (central, residential-only):
//   pmsuryaghar.gov.in — ₹30,000/kW for the first 2kW, ₹18,000 for the 3rd kW,
//   capped at ₹78,000 total. No further central subsidy for capacity beyond 3kW.
// - Delhi state top-up (residential-only): solar.delhi.gov.in/page/state-subsidy —
//   ₹10,000/kW, capped at the first 3kW per consumer.
// - Commercial/institutional rooftop installs are NOT eligible for PM Surya
//   Ghar (it is explicitly a residential household scheme), so no scheme
//   subsidy is applied by default for that building type.

export type BuildingUsageType = "residential" | "commercial";

const CENTRAL_SUBSIDY_CAP = 78_000;
const CENTRAL_RATE_FIRST_2KW = 30_000; // ₹/kW
const CENTRAL_RATE_3RD_KW = 18_000; // ₹/kW
const CENTRAL_SUBSIDY_ELIGIBLE_KW = 3;

const DELHI_STATE_RATE_PER_KW = 10_000; // ₹/kW
const DELHI_STATE_ELIGIBLE_KW = 3;

export interface SubsidyBreakdown {
  centralSubsidy: number;
  stateSubsidy: number;
  totalSubsidy: number;
  eligible: boolean;
  note: string;
}

export function computeDelhiSolarSubsidy(capacityKw: number, usageType: BuildingUsageType): SubsidyBreakdown {
  if (usageType !== "residential") {
    return {
      centralSubsidy: 0,
      stateSubsidy: 0,
      totalSubsidy: 0,
      eligible: false,
      note: "PM Surya Ghar and Delhi's state top-up are residential-household schemes only — commercial/institutional rooftops aren't eligible under this scheme.",
    };
  }

  const centralEligibleKw = Math.min(capacityKw, CENTRAL_SUBSIDY_ELIGIBLE_KW);
  const centralSubsidy = Math.min(
    CENTRAL_SUBSIDY_CAP,
    CENTRAL_RATE_FIRST_2KW * Math.min(centralEligibleKw, 2) +
      CENTRAL_RATE_3RD_KW * Math.max(0, centralEligibleKw - 2),
  );

  const stateEligibleKw = Math.min(capacityKw, DELHI_STATE_ELIGIBLE_KW);
  const stateSubsidy = DELHI_STATE_RATE_PER_KW * stateEligibleKw;

  const totalSubsidy = centralSubsidy + stateSubsidy;

  return {
    centralSubsidy: Math.round(centralSubsidy),
    stateSubsidy: Math.round(stateSubsidy),
    totalSubsidy: Math.round(totalSubsidy),
    eligible: true,
    note: `Eligible for PM Surya Ghar and Delhi state top-up subsidies. Central subsidy capped at ₹${CENTRAL_SUBSIDY_CAP}.`,
  };
}

// Blended default tariffs and installed price/watt by building usage type —
// see calculators/financial.ts header for source citations.
export const DEFAULT_TARIFF_PER_KWH: Record<BuildingUsageType, number> = {
  residential: 7, // ₹/kWh — blended above BSES's subsidized 0-400 unit slabs (most solar savings land in the ₹6.5-8 slabs)
  commercial: 9.5, // ₹/kWh — mid of BSES commercial ₹9-11/unit incl. PPAC
};

export const DEFAULT_PRICE_PER_WATT: Record<BuildingUsageType, number> = {
  residential: 65, // ₹/W all-in installed, mid of the ₹55-85/W 2026 residential range
  commercial: 40, // ₹/W all-in installed, mid of the ₹35-45/W 2026 commercial range
};
