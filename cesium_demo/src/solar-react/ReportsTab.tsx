import { useState } from "react";
import { SolarAreaEstimate } from "../solar/solarService";
import { exportCsv, exportGeoJson, exportExcel, exportPdf } from "./calculators/reportExport";

interface ReportsTabProps {
  estimate: SolarAreaEstimate | null;
}

type ExportKind = "csv" | "geojson" | "excel" | "pdf";

export function ReportsTab({ estimate }: ReportsTabProps) {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (kind: ExportKind, fn: (e: SolarAreaEstimate) => void) => {
    if (!estimate) return;
    setBusy(kind);
    setError(null);
    // Let the button's disabled state paint before the (synchronous, can be
    // slow for large PDFs) export work blocks the main thread.
    setTimeout(() => {
      try {
        fn(estimate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(null);
      }
    }, 30);
  };

  if (!estimate) {
    return (
      <div className="sw-tab-body">
        <div className="sw-empty-state">Run an analysis on the Dashboard tab first — reports export that result set.</div>
      </div>
    );
  }

  return (
    <div className="sw-tab-body">
      <div className="sw-section">
        <div className="sw-section-title">Generate Report</div>
        <div className="sw-section-hint">
          Exports the {estimate.buildings.length} buildings from the current analysis ({estimate.date}, {estimate.datasetOrigin === "precomputed" ? "precomputed May dataset" : "live NASA POWER estimate"}).
          Battery/EV/financial columns use shared default assumptions — open a building's own tab to see figures under custom assumptions.
        </div>

        <div className="sw-report-grid">
          <ReportButton
            title="CSV"
            desc="Building summary — one row per building, all computed fields."
            busy={busy === "csv"}
            onClick={() => run("csv", exportCsv)}
          />
          <ReportButton
            title="GeoJSON"
            desc="Real building footprints + solar properties — for GIS tools."
            busy={busy === "geojson"}
            onClick={() => run("geojson", exportGeoJson)}
          />
          <ReportButton
            title="Excel"
            desc="Community Summary + Buildings sheets in one workbook."
            busy={busy === "excel"}
            onClick={() => run("excel", exportExcel)}
          />
          <ReportButton
            title="PDF"
            desc="Formatted report: community summary + building table (data tables only, no chart images)."
            busy={busy === "pdf"}
            onClick={() => run("pdf", exportPdf)}
          />
        </div>

        {error && <div className="sw-error">⚠ {error}</div>}
      </div>
    </div>
  );
}

function ReportButton({ title, desc, busy, onClick }: { title: string; desc: string; busy: boolean; onClick: () => void }) {
  return (
    <button className="sw-report-btn" onClick={onClick} disabled={busy}>
      <div className="sw-report-btn-title">{busy ? "Generating…" : title}</div>
      <div className="sw-report-btn-desc">{desc}</div>
    </button>
  );
}
