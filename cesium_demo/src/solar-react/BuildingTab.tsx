import { useMemo, useState } from "react";
import { SolarBuildingEstimate } from "../solar/solarService";
import { recommendBattery, DEFAULT_BATTERY_ASSUMPTIONS, BatteryAssumptions } from "./calculators/battery";
import { estimateEvCapacity, DEFAULT_EV_ASSUMPTIONS, EvAssumptions } from "./calculators/ev";
import { estimateFinancials, DEFAULT_FINANCIAL_ASSUMPTIONS, FinancialAssumptions } from "./calculators/financial";
import { BuildingUsageType, DEFAULT_PRICE_PER_WATT, DEFAULT_TARIFF_PER_KWH } from "./calculators/solarSubsidy";
import { estimateCo2 } from "./calculators/co2";
import { deriveMonthlyProduction } from "./calculators/monthly";
import { AssumptionInput } from "./components/AssumptionInput";
import { MonthlyChart } from "./components/MonthlyChart";

interface BuildingTabProps {
  building: SolarBuildingEstimate | null;
  displayName: string | null;
  monthlyIrradianceKwhM2Day: number[];
  monthIndex: number;
}

export function BuildingTab({ building, displayName, monthlyIrradianceKwhM2Day, monthIndex }: BuildingTabProps) {
  const [batteryA, setBatteryA] = useState<BatteryAssumptions>(DEFAULT_BATTERY_ASSUMPTIONS);
  const [evA, setEvA] = useState<EvAssumptions>(DEFAULT_EV_ASSUMPTIONS);
  const [finA, setFinA] = useState<FinancialAssumptions>(DEFAULT_FINANCIAL_ASSUMPTIONS);

  const battery = useMemo(() => (building ? recommendBattery(building.dailyKwh, batteryA) : null), [building, batteryA]);
  const ev = useMemo(() => (building ? estimateEvCapacity(building.dailyKwh, evA) : null), [building, evA]);
  const financial = useMemo(
    () => (building ? estimateFinancials(building.usableAreaM2, building.annualKwh, finA) : null),
    [building, finA],
  );
  const co2 = useMemo(() => (building ? estimateCo2(building.annualKwh) : null), [building]);
  const monthly = useMemo(
    () => (building ? deriveMonthlyProduction(building.dailyKwh, building.irradianceKwhM2Day, monthlyIrradianceKwhM2Day) : []),
    [building, monthlyIrradianceKwhM2Day],
  );
  const monthlySavings = useMemo(
    () => monthly.map((m) => ({ ...m, dailyKwh: Math.round(m.dailyKwh * (finA.tariffPerKwh) * 10) / 10 })),
    [monthly, finA.tariffPerKwh],
  );
  const setUsageType = (usageType: BuildingUsageType) => {
    setFinA({
      ...finA,
      usageType,
      pricePerWatt: DEFAULT_PRICE_PER_WATT[usageType],
      tariffPerKwh: DEFAULT_TARIFF_PER_KWH[usageType],
    });
  };

  if (!building) {
    return (
      <div className="sw-tab-body">
        <div className="sw-empty-state">Click a colored rooftop on the map (after running an analysis on the Dashboard tab) to see its details here.</div>
      </div>
    );
  }

  return (
    <div className="sw-tab-body">
      <div className="sw-section">
        <div className="sw-building-hdr">
          <div>
            <div className="sw-building-name">{displayName ?? "Solar Building"}</div>
            {building.externalId && <div className="sw-building-id">Source ID: {building.externalId}</div>}
            <span className={`sw-badge sw-badge--${building.suitability}`}>{building.suitability}</span>
          </div>
        </div>

        <div className="sw-kpi-grid">
          <KV label="Roof area" value={`${(building.areaSqm ?? 0).toFixed(0)} m²`} />
          <KV label="Usable roof" value={`${building.usableAreaM2.toFixed(0)} m²`} />
          <KV label="Panel capacity" value={`${financial?.capacityKw.toFixed(1)} kW`} />
          <KV label="Daily output" value={`${building.dailyKwh.toFixed(1)} kWh`} />
          <KV label="Annual output" value={`${building.annualKwh.toLocaleString()} kWh`} />
          <KV label="CO₂ reduction" value={co2 ? `${(co2.annualCo2SavedKg / 1000).toFixed(2)} t/yr` : "—"} />
        </div>
      </div>

      <div className="sw-section">
        <div className="sw-section-title">Monthly production</div>
        <div className="sw-section-hint">Derived from real NASA POWER monthly irradiance, scaled against this building's computed output for the selected date.</div>
        <MonthlyChart data={monthly} currentMonthIndex={monthIndex} />
      </div>

      <div className="sw-section">
        <div className="sw-section-title">Monthly savings estimate</div>
        <MonthlyChart data={monthlySavings} currentMonthIndex={monthIndex} unit="₹/day" label="Savings" />
      </div>

      {battery && (
        <div className="sw-section">
          <div className="sw-section-title">Battery recommendation</div>
          <div className="sw-section-hint">Sized off this building's own generation — no real load profile exists, so this is a rule-of-thumb, not a load study.</div>
          <div className="sw-kpi-grid">
            <KV label="Recommended size" value={`${battery.recommendedSizeKwh} kWh`} />
            <KV label="Backup hours" value={`${battery.backupHours} h`} />
            <KV label="Utilization" value={`${battery.utilizationPct}%`} />
            <KV label="Self-consumption" value={`${battery.selfConsumptionPct}%`} />
          </div>
          <details className="sw-assumptions">
            <summary>Adjust assumptions</summary>
            <AssumptionInput label="Target evening coverage" value={batteryA.targetCoverageFraction * 100} unit="%" step={5} min={0} max={100}
              onChange={(v) => setBatteryA({ ...batteryA, targetCoverageFraction: v / 100 })} />
            <AssumptionInput label="Round-trip efficiency" value={batteryA.roundTripEfficiency * 100} unit="%" step={1} min={50} max={100}
              onChange={(v) => setBatteryA({ ...batteryA, roundTripEfficiency: v / 100 })} />
            <AssumptionInput label="Assumed night load" value={batteryA.assumedNightLoadKw} unit="kW" step={0.1} min={0.1}
              onChange={(v) => setBatteryA({ ...batteryA, assumedNightLoadKw: v })} />
          </details>
        </div>
      )}

      {ev && (
        <div className="sw-section">
          <div className="sw-section-title">EV charging capacity</div>
          <div className="sw-section-hint">Estimated from surplus generation, not a real charger installation.</div>
          <div className="sw-kpi-grid">
            <KV label="Cars/day" value={String(ev.carsPerDay)} />
            <KV label="Sessions/day" value={String(ev.sessionsPerDay)} />
            <KV label="Charging energy" value={`${ev.chargingEnergyKwh} kWh`} />
            <KV label="Recommended charger" value={`${ev.recommendedChargerKw} kW`} />
          </div>
          <details className="sw-assumptions">
            <summary>Adjust assumptions</summary>
            <AssumptionInput label="Surplus for EV" value={evA.surplusFraction * 100} unit="%" step={5} min={0} max={100}
              onChange={(v) => setEvA({ ...evA, surplusFraction: v / 100 })} />
            <AssumptionInput label="Avg session size" value={evA.avgSessionKwh} unit="kWh" step={1} min={1}
              onChange={(v) => setEvA({ ...evA, avgSessionKwh: v })} />
          </details>
        </div>
      )}

      {financial && (
        <div className="sw-section">
          <div className="sw-section-title">Financial summary</div>
          <div className="sw-section-hint">
            Subsidy is computed from the real PM Surya Ghar (central) + Delhi state rooftop solar schemes, not a guessed percentage.
            Panel price and tariff default to current (Jul 2026) Delhi market/BSES figures — still editable, since actual billing depends on your consumption slab and installer quote.
            Schemes change; verify at <span className="sw-source-link">pmsuryaghar.gov.in</span> / <span className="sw-source-link">solar.delhi.gov.in</span> before relying on this for a purchase decision.
          </div>

          <div className="sw-usage-toggle">
            <button className={`sw-usage-btn${finA.usageType === "residential" ? " sw-usage-btn--active" : ""}`} onClick={() => setUsageType("residential")}>
              Residential
            </button>
            <button className={`sw-usage-btn${finA.usageType === "commercial" ? " sw-usage-btn--active" : ""}`} onClick={() => setUsageType("commercial")}>
              Commercial
            </button>
          </div>

          <div className="sw-kpi-grid">
            <KV label="Panel capacity" value={`${financial.capacityKw.toFixed(1)} kW`} />
            <KV label="Installation cost" value={`₹${financial.installationCost.toLocaleString()}`} />
            <KV label="Central subsidy (PM Surya Ghar)" value={`₹${financial.centralSubsidy.toLocaleString()}`} />
            <KV label="Delhi state subsidy" value={`₹${financial.stateSubsidy.toLocaleString()}`} />
            <KV label="Total subsidy" value={`₹${financial.subsidyAmount.toLocaleString()}`} />
            <KV label="Net investment" value={`₹${financial.netInvestment.toLocaleString()}`} />
            <KV label="Year-1 savings" value={`₹${financial.annualSavingsYear1.toLocaleString()}`} />
            <KV label="Payback" value={financial.paybackYears !== null ? `${financial.paybackYears} yr` : "—"} />
            <KV label={`${finA.horizonYears}-yr savings`} value={`₹${financial.horizonSavings.toLocaleString()}`} />
            <KV label="ROI" value={financial.roiPct !== null ? `${financial.roiPct}%` : "—"} />
            <KV label="IRR" value={financial.irrPct !== null ? `${financial.irrPct}%` : "—"} />
            <KV label="NPV" value={`₹${financial.npvAtDiscountRate.toLocaleString()}`} />
          </div>
          <div className="sw-section-hint" style={{ marginTop: 8 }}>{financial.subsidyNote}</div>

          <details className="sw-assumptions">
            <summary>Adjust assumptions</summary>
            <AssumptionInput label="Panel price" value={finA.pricePerWatt} unit="₹/W" step={1} min={1}
              onChange={(v) => setFinA({ ...finA, pricePerWatt: v })} />
            <AssumptionInput label="Electricity tariff" value={finA.tariffPerKwh} unit="₹/kWh" step={0.5} min={0}
              onChange={(v) => setFinA({ ...finA, tariffPerKwh: v })} />
            <AssumptionInput label="Annual degradation" value={finA.annualDegradation * 100} unit="%" step={0.1} min={0}
              onChange={(v) => setFinA({ ...finA, annualDegradation: v / 100 })} />
            <AssumptionInput label="Annual maintenance" value={finA.annualMaintenanceCost} unit="₹" step={100} min={0}
              onChange={(v) => setFinA({ ...finA, annualMaintenanceCost: v })} />
            <AssumptionInput label="Discount rate" value={finA.discountRate * 100} unit="%" step={0.5} min={0}
              onChange={(v) => setFinA({ ...finA, discountRate: v / 100 })} />
          </details>
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="sw-kpi-card sw-kpi-card--flat">
      <div className="sw-kpi-label">{label}</div>
      <div className="sw-kpi-value">{value}</div>
    </div>
  );
}
