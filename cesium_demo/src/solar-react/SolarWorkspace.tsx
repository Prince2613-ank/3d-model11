import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { SolarMode } from "../solar/constants";
import { clearSelectedSolarHighlight, renderSolarEstimates, showSelectedSolarBuilding } from "../solar/solarRenderer";
import { useSolarAnalysis } from "./hooks/useSolarAnalysis";
import { useBuildingPicker } from "./hooks/useBuildingPicker";
import { DashboardTab } from "./DashboardTab";
import { BuildingTab } from "./BuildingTab";
import { CommunityTab } from "./CommunityTab";
import { ReportsTab } from "./ReportsTab";
import { SolarBuildingEstimate } from "../solar/solarService";
import "./solarWorkspace.css";
import { enterSolarMapMode, exitSolarMapMode } from "../floors";

type TabKey = "dashboard" | "building" | "community" | "reports";

const TABS: { key: TabKey; label: string; enabled: boolean }[] = [
  { key: "dashboard", label: "Dashboard", enabled: true },
  { key: "building", label: "Building", enabled: true },
  { key: "community", label: "Community", enabled: true },
  { key: "reports", label: "Reports", enabled: true },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getSolarBuildingDisplayName(building: SolarBuildingEstimate, buildings: SolarBuildingEstimate[]): string {
  if (building.name?.trim()) return building.name.trim();
  const index = buildings.findIndex((b) => b.id === building.id);
  return `Solar Building ${index >= 0 ? index + 1 : ""}`.trim();
}

export function SolarWorkspace() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [date, setDate] = useState(todayIso());
  const [mode, setMode] = useState<SolarMode>("free");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);

  const { estimate, loading, error, runAnalysis, clear } = useSolarAnalysis();

  const openWorkspace = () => {
    setOpen(true);
  };

  const closeWorkspace = () => {
    setOpen(false);
    exitSolarMapMode();
  };

  useBuildingPicker(estimate, (id) => {
    setSelectedBuildingId(id);
    setTab("building");
  });

  const selectedBuilding = useMemo(
    () => estimate?.buildings.find((b) => b.id === selectedBuildingId) ?? null,
    [estimate, selectedBuildingId],
  );
  const selectedBuildingName = useMemo(
    () => (selectedBuilding && estimate ? getSolarBuildingDisplayName(selectedBuilding, estimate.buildings) : null),
    [estimate, selectedBuilding],
  );

  // Every analyzed building renders at once — reuses the existing renderer
  // as-is whenever a fresh estimate comes in.
  useEffect(() => {
    if (!estimate) return;
    renderSolarEstimates(estimate.buildings);
  }, [estimate]);

  useEffect(() => {
    showSelectedSolarBuilding(selectedBuilding, selectedBuildingName ?? undefined);
  }, [selectedBuilding, selectedBuildingName]);

  const handleAnalyze = () => {
    enterSolarMapMode();
    void runAnalysis(date, mode);
  };

  const handleClear = () => {
    setSelectedBuildingId(null);
    clearSelectedSolarHighlight();
    clear();
  };

  const monthIndex = useMemo(() => {
    const [, m] = date.split("-").map(Number);
    return (m || 1) - 1;
  }, [date]);

  // Mount the nav icon into Cesium's own top-right toolbar, right next to the
  // Explore Nearby icon, instead of floating a separate button on the page.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const toolbar = document.querySelector<HTMLElement>(".cesium-viewer-toolbar");
    if (!toolbar) return;
    let anchor = document.getElementById("solarWorkspaceAnchor");
    if (!anchor) {
      anchor = document.createElement("span");
      anchor.id = "solarWorkspaceAnchor";
      anchor.style.display = "contents";
      const nearbyBtn = document.getElementById("nearbyNavBtn");
      if (nearbyBtn && toolbar.contains(nearbyBtn)) nearbyBtn.after(anchor);
      else toolbar.appendChild(anchor);
    }
    setPortalTarget(anchor);
  }, []);

  const navButton = (
    <button
      id="solarToolbarBtn"
      className={`sw-nav-icon-btn${open ? " sw-nav-icon-btn--active" : ""}`}
      title="Rooftop Solar Workspace"
      aria-label="Rooftop Solar Workspace"
      onClick={() => open ? closeWorkspace() : openWorkspace()}
      // Fallback position only applies if the Cesium toolbar wasn't found to
      // portal into — once portaled, the toolbar's flex layout takes over.
      style={portalTarget ? undefined : { position: "fixed", top: 24, right: 54, zIndex: 900 }}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4.2" />
        <line x1="12" y1="2.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.5" />
        <line x1="4.2" y1="4.2" x2="6" y2="6" />
        <line x1="18" y1="18" x2="19.8" y2="19.8" />
        <line x1="2.5" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.5" y2="12" />
        <line x1="4.2" y1="19.8" x2="6" y2="18" />
        <line x1="18" y1="6" x2="19.8" y2="4.2" />
      </svg>
    </button>
  );

  return (
    <>
      {portalTarget ? createPortal(navButton, portalTarget) : navButton}

      <AnimatePresence>
        {open && (
          <motion.div
            className="sw-workspace"
            initial={{ x: 460, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 460, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="sw-hdr">
              <div className="sw-hdr-title-group">
                <span className="sw-hdr-icon">☀</span>
                <div>
                  <div className="sw-hdr-title">Solar Workspace</div>
                  <div className="sw-hdr-sub">Rooftop generation, financials & community insight</div>
                </div>
              </div>
              <button className="sw-icon-btn" onClick={closeWorkspace} title="Close">✕</button>
            </div>

            <div className="sw-tabs">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`sw-tab${tab === t.key ? " sw-tab--active" : ""}${!t.enabled ? " sw-tab--disabled" : ""}`}
                  onClick={() => t.enabled && setTab(t.key)}
                  disabled={!t.enabled}
                  title={t.enabled ? undefined : "Coming soon"}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="sw-body">
              {tab === "dashboard" && (
                <DashboardTab
                  date={date}
                  onDateChange={setDate}
                  mode={mode}
                  onModeChange={setMode}
                  estimate={estimate}
                  loading={loading}
                  error={error}
                  onAnalyze={handleAnalyze}
                  onClear={handleClear}
                />
              )}
              {tab === "building" && (
                <BuildingTab
                  building={selectedBuilding}
                  displayName={selectedBuildingName}
                  monthlyIrradianceKwhM2Day={estimate?.monthlyIrradianceKwhM2Day ?? []}
                  monthIndex={monthIndex}
                />
              )}
              {tab === "community" && <CommunityTab estimate={estimate} />}
              {tab === "reports" && <ReportsTab estimate={estimate} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
