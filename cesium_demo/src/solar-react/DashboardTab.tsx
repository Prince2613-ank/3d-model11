import { motion, AnimatePresence } from "framer-motion";
import { SolarMode, SOLAR_COLOR_STOPS } from "../solar/constants";
import { SolarAreaEstimate } from "../solar/solarService";
import { KpiCard } from "./components/KpiCard";
import { estimateCo2 } from "./calculators/co2";
import { Suitability } from "./types";

interface DashboardTabProps {
  date: string;
  onDateChange: (date: string) => void;
  mode: SolarMode;
  onModeChange: (mode: SolarMode) => void;
  estimate: SolarAreaEstimate | null;
  loading: boolean;
  error: string | null;
  onAnalyze: () => void;
  onClear: () => void;
}

export function DashboardTab({
  date, onDateChange,
  estimate, loading, error, onAnalyze, onClear,
}: DashboardTabProps) {
  const co2 = estimate ? estimateCo2(estimate.summary.totalAnnualKwh) : null;
  const totalUsableAreaM2 = estimate ? estimate.buildings.reduce((s, b) => s + b.usableAreaM2, 0) : 0;
  const avgScorePct = estimate && estimate.buildings.length > 0
    ? Math.round(
        estimate.buildings.reduce((s, b) => s + SUITABILITY_SCORE[b.suitability], 0) / estimate.buildings.length,
      )
    : null;

  return (
    <div className="sw-tab-body">
      <div className="sw-section">
        <div className="sw-section-title">Solar Analysis</div>
        <div className="sw-controls-row">
          <label className="sw-field" style={{ flex: 1 }}>
            <span>Date</span>
            <input type="date" className="sw-input" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </label>
          {/* Data source selector intentionally hidden from UI */}
        </div>
        <div className="sw-actions-row">
          <button className="sw-btn sw-btn--primary" disabled={loading} onClick={onAnalyze}>
            {loading ? "Analyzing…" : "Analyze Punjabi Bagh"}
          </button>
          <button className="sw-btn" onClick={onClear} disabled={!estimate}>Clear</button>
        </div>
        {error && <div className="sw-error">⚠ {error}</div>}
        {/* data-source warning intentionally hidden from UI */}
      </div>

      <div className="sw-section">
        <div className="sw-section-title">Solar Heatmap Legend</div>
        <div className="sw-section-hint">Rooftops use this color scale for relative solar generation in the current analysis.</div>
        <div
          className="sw-heatmap-bar"
          style={{ background: `linear-gradient(90deg, ${SOLAR_COLOR_STOPS.map((stop) => `${rgbStopToCss(stop.color)} ${stop.at * 100}%`).join(", ")})` }}
          aria-label="Solar generation heatmap from low to high"
        />
        <div className="sw-heatmap-scale">
          <span>Lower generation</span>
          <span>Higher generation</span>
        </div>
        <div className="sw-heatmap-chips">
          {HEATMAP_LABELS.map((item) => (
            <span className="sw-heatmap-chip" key={item.label}>
              <span className="sw-heatmap-dot" style={{ background: rgbStopToCss(item.color) }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {estimate && (
          <motion.div
            key="kpis"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sw-section"
          >
            <div className="sw-kpi-grid">
              <KpiCard index={0} label="Buildings analyzed" value={String(estimate.summary.count)} />
              <KpiCard index={1} label="Avg irradiance" value={`${estimate.summary.avgIrradianceKwhM2Day.toFixed(2)}`} sub="kWh/m²/day" />
              <KpiCard index={2} label="Total daily generation" value={estimate.summary.totalDailyKwh.toLocaleString()} sub="kWh/day" />
              <KpiCard index={3} label="Annual generation" value={estimate.summary.totalAnnualKwh.toLocaleString()} sub="kWh/year" />
              <KpiCard index={4} label="Avg solar score" value={avgScorePct !== null ? `${avgScorePct}/100` : "—"} />
              <KpiCard index={5} label="Total usable rooftop" value={Math.round(totalUsableAreaM2).toLocaleString()} sub="m²" />
              <KpiCard index={6} label="Est. CO₂ savings" value={co2 ? `${(co2.annualCo2SavedKg / 1000).toFixed(1)} t/yr` : "—"} sub={co2 ? `≈ ${co2.equivalentTreesPerYear} trees/yr` : undefined} />
              {/* Data source card intentionally hidden from UI */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const SUITABILITY_SCORE: Record<Suitability, number> = {
  excellent: 90,
  good: 70,
  fair: 50,
  poor: 25,
};

const HEATMAP_LABELS = [
  { label: "Poor", color: SOLAR_COLOR_STOPS[0].color },
  { label: "Fair", color: SOLAR_COLOR_STOPS[1].color },
  { label: "Good", color: SOLAR_COLOR_STOPS[2].color },
  { label: "Excellent", color: SOLAR_COLOR_STOPS[3].color },
];

function rgbStopToCss([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}
