import { useMemo } from "react";
import { SolarAreaEstimate } from "../solar/solarService";
import { summarizeCommunity } from "./calculators/community";
import { KpiCard } from "./components/KpiCard";
import { DonutChart } from "./components/DonutChart";
import { CommunityBarChart } from "./components/CommunityBarChart";
import { Suitability } from "./types";

const SUITABILITY_COLOR: Record<Suitability, string> = {
  excellent: "#009688",
  good: "#eab308",
  fair: "#f97316",
  poor: "#db2777",
};

interface CommunityTabProps {
  estimate: SolarAreaEstimate | null;
}

export function CommunityTab({ estimate }: CommunityTabProps) {
  const summary = useMemo(() => (estimate ? summarizeCommunity(estimate.buildings) : null), [estimate]);

  if (!estimate || !summary) {
    return (
      <div className="sw-tab-body">
        <div className="sw-empty-state">Run an analysis on the Dashboard tab first — community metrics aggregate that result set.</div>
      </div>
    );
  }

  const donutData = (["excellent", "good", "fair", "poor"] as Suitability[]).map((k) => ({
    name: k, value: summary.suitabilityCounts[k], color: SUITABILITY_COLOR[k],
  }));

  const generationByBucket = (["excellent", "good", "fair", "poor"] as Suitability[]).map((k) => ({
    label: k,
    value: Math.round(
      estimate.buildings.filter((b) => b.suitability === k).reduce((s, b) => s + b.dailyKwh, 0),
    ),
    color: SUITABILITY_COLOR[k],
  }));

  return (
    <div className="sw-tab-body">
      <div className="sw-section">
        <div className="sw-section-title">Community Overview</div>
        <div className="sw-section-hint">Aggregated from the {summary.buildingCount} buildings in the current analysis.</div>
        <div className="sw-kpi-grid">
          <KpiCard index={0} label="Buildings" value={String(summary.buildingCount)} />
          <KpiCard index={1} label="Total roof area" value={summary.totalRoofAreaM2.toLocaleString()} sub="m²" />
          <KpiCard index={2} label="Total usable roof" value={summary.totalUsableRoofM2.toLocaleString()} sub="m²" />
          <KpiCard index={3} label="Total daily generation" value={summary.totalDailyKwh.toLocaleString()} sub="kWh/day" />
          <KpiCard index={4} label="Total annual generation" value={summary.totalAnnualKwh.toLocaleString()} sub="kWh/yr" />
          <KpiCard index={5} label="Avg solar score" value={`${summary.avgSolarScore}/100`} />
          <KpiCard index={6} label="Avg ROI" value={summary.avgRoiPct !== null ? `${summary.avgRoiPct}%` : "—"} sub="default assumptions" />
          <KpiCard index={7} label="Total CO₂ saved" value={`${summary.totalCo2SavedTons} t/yr`} />
          <KpiCard index={8} label="Equivalent trees" value={summary.equivalentTrees.toLocaleString()} sub="planted/yr" />
          <KpiCard index={9} label="Homes powered" value={summary.equivalentHomesPowered.toLocaleString()} sub="Delhi avg household/yr" />
        </div>
      </div>

      <div className="sw-section">
        <div className="sw-section-title">Suitability Breakdown</div>
        <DonutChart data={donutData} />
      </div>

      <div className="sw-section">
        <div className="sw-section-title">Generation by Suitability</div>
        <CommunityBarChart data={generationByBucket} valueLabel="kWh/day" />
      </div>
    </div>
  );
}
