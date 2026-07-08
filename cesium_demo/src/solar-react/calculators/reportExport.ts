// Client-side report generation — CSV, GeoJSON, Excel, PDF. All four are
// built purely from data already returned by an analysis (plus the same
// default-assumption calculators used elsewhere); nothing here re-derives
// the estimation engine.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { SolarAreaEstimate, SolarBuildingEstimate } from "../../solar/solarService";
import { summarizeCommunity } from "./community";
import { recommendBattery, DEFAULT_BATTERY_ASSUMPTIONS } from "./battery";
import { estimateEvCapacity, DEFAULT_EV_ASSUMPTIONS } from "./ev";
import { estimateFinancials, DEFAULT_FINANCIAL_ASSUMPTIONS } from "./financial";
import { estimateCo2 } from "./co2";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

interface ReportRow {
  id: string;
  name: string;
  suitability: string;
  latitude: number;
  longitude: number;
  roofAreaM2: number;
  usableAreaM2: number;
  heightM: number;
  irradianceKwhM2Day: number;
  shadingLossPct: number | string;
  dailyKwh: number;
  annualKwh: number;
  panelCapacityKw: number;
  batteryRecommendationKwh: number;
  evCarsPerDay: number;
  co2SavedKgPerYear: number;
  installationCostInr: number;
  subsidyInr: number;
  netInvestmentInr: number;
  paybackYears: number | string;
  roiPct: number | string;
}

function buildReportRows(buildings: SolarBuildingEstimate[]): ReportRow[] {
  return buildings.map((b) => {
    const battery = recommendBattery(b.dailyKwh, DEFAULT_BATTERY_ASSUMPTIONS);
    const ev = estimateEvCapacity(b.dailyKwh, DEFAULT_EV_ASSUMPTIONS);
    const financial = estimateFinancials(b.usableAreaM2, b.annualKwh, DEFAULT_FINANCIAL_ASSUMPTIONS);
    const co2 = estimateCo2(b.annualKwh);

    return {
      id: b.id,
      name: b.name || b.externalId || "Building",
      suitability: b.suitability,
      latitude: b.centroid.lat,
      longitude: b.centroid.lon,
      roofAreaM2: b.areaSqm ?? 0,
      usableAreaM2: b.usableAreaM2,
      heightM: b.height,
      irradianceKwhM2Day: b.irradianceKwhM2Day,
      shadingLossPct: b.shadingFactor === null ? "n/a" : Math.round(b.shadingFactor * 100),
      dailyKwh: b.dailyKwh,
      annualKwh: b.annualKwh,
      panelCapacityKw: financial.capacityKw,
      batteryRecommendationKwh: battery.recommendedSizeKwh,
      evCarsPerDay: ev.carsPerDay,
      co2SavedKgPerYear: co2.annualCo2SavedKg,
      installationCostInr: financial.installationCost,
      subsidyInr: financial.subsidyAmount,
      netInvestmentInr: financial.netInvestment,
      paybackYears: financial.paybackYears ?? "n/a",
      roiPct: financial.roiPct ?? "n/a",
    };
  });
}

function reportFilename(estimate: SolarAreaEstimate, ext: string): string {
  return `solar-report_${estimate.date}_${estimate.mode}.${ext}`;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

export function exportCsv(estimate: SolarAreaEstimate): void {
  const rows = buildReportRows(estimate.buildings);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify((r as any)[h] ?? "")).join(",")),
  ];
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), reportFilename(estimate, "csv"));
}

// ── GeoJSON ──────────────────────────────────────────────────────────────────

export function exportGeoJson(estimate: SolarAreaEstimate): void {
  const features = estimate.buildings.map((b) => ({
    type: "Feature" as const,
    geometry: b.geojson,
    properties: {
      id: b.id,
      name: b.name,
      suitability: b.suitability,
      areaSqm: b.areaSqm,
      usableAreaM2: b.usableAreaM2,
      dailyKwh: b.dailyKwh,
      annualKwh: b.annualKwh,
      irradianceKwhM2Day: b.irradianceKwhM2Day,
      shadingFactor: b.shadingFactor,
      height: b.height,
      source: b.source,
    },
  }));
  const collection = { type: "FeatureCollection" as const, features };
  downloadBlob(
    new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" }),
    reportFilename(estimate, "geojson"),
  );
}

// ── Excel ────────────────────────────────────────────────────────────────────

export function exportExcel(estimate: SolarAreaEstimate): void {
  const rows = buildReportRows(estimate.buildings);
  const community = summarizeCommunity(estimate.buildings);

  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["Solar Report Summary"],
    ["Date", estimate.date],
    ["Data source", estimate.datasetOrigin === "precomputed" ? "Precomputed dataset (May)" : "Live NASA POWER estimate"],
    ["Mode", estimate.mode],
    [],
    ["Buildings analyzed", community.buildingCount],
    ["Total roof area (m²)", community.totalRoofAreaM2],
    ["Total usable roof (m²)", community.totalUsableRoofM2],
    ["Total daily generation (kWh)", community.totalDailyKwh],
    ["Total annual generation (kWh)", community.totalAnnualKwh],
    ["Average solar score", community.avgSolarScore],
    ["Average ROI (%)", community.avgRoiPct ?? "n/a"],
    ["Total CO2 saved (tons/yr)", community.totalCo2SavedTons],
    ["Equivalent trees/yr", community.equivalentTrees],
    ["Equivalent homes powered", community.equivalentHomesPowered],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Community Summary");

  const buildingsSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, buildingsSheet, "Buildings");

  XLSX.writeFile(wb, reportFilename(estimate, "xlsx"));
}

// ── PDF ──────────────────────────────────────────────────────────────────────
// Text/table report only — chart images aren't embedded (would need an
// html2canvas-style capture step this pass didn't add), so the underlying
// data tables are included instead of chart snapshots.

const PDF_ROW_LIMIT = 150; // keep the PDF a sane size for large analyses

export function exportPdf(estimate: SolarAreaEstimate): void {
  const rows = buildReportRows(estimate.buildings).slice(0, PDF_ROW_LIMIT);
  const community = summarizeCommunity(estimate.buildings);
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(16);
  doc.text("Rooftop Solar Potential — Report", 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    `Date: ${estimate.date}   Mode: ${estimate.mode}   Source: ${estimate.datasetOrigin === "precomputed" ? "Precomputed dataset (May)" : "Live NASA POWER estimate"}`,
    14, 22,
  );
  if (estimate.warning) {
    doc.setTextColor(180, 90, 0);
    doc.text(`Note: ${doc.splitTextToSize(estimate.warning, 260)[0]}`, 14, 27);
  }

  autoTable(doc, {
    startY: 32,
    head: [["Community Summary", ""]],
    body: [
      ["Buildings analyzed", String(community.buildingCount)],
      ["Total roof area (m²)", String(community.totalRoofAreaM2)],
      ["Total usable roof (m²)", String(community.totalUsableRoofM2)],
      ["Total daily generation (kWh)", String(community.totalDailyKwh)],
      ["Total annual generation (kWh)", String(community.totalAnnualKwh)],
      ["Average solar score", String(community.avgSolarScore)],
      ["Average ROI (%)", String(community.avgRoiPct ?? "n/a")],
      ["Total CO2 saved (tons/yr)", String(community.totalCo2SavedTons)],
      ["Equivalent trees/yr", String(community.equivalentTrees)],
      ["Equivalent homes powered", String(community.equivalentHomesPowered)],
    ],
    theme: "grid",
    headStyles: { fillColor: [230, 180, 30] },
    styles: { fontSize: 8 },
    tableWidth: 90,
  });

  const afterSummaryY = (doc as any).lastAutoTable?.finalY ?? 32;

  autoTable(doc, {
    startY: afterSummaryY + 8,
    head: [[
      "Building", "Suitability", "Roof m²", "Usable m²", "Daily kWh", "Annual kWh",
      "Capacity kW", "Battery kWh", "EV/day", "CO2 kg/yr", "Payback yr", "ROI %",
    ]],
    body: rows.map((r) => [
      r.name, r.suitability, String(r.roofAreaM2), String(r.usableAreaM2), String(r.dailyKwh), String(r.annualKwh),
      String(r.panelCapacityKw), String(r.batteryRecommendationKwh), String(r.evCarsPerDay), String(r.co2SavedKgPerYear),
      String(r.paybackYears), String(r.roiPct),
    ]),
    theme: "striped",
    headStyles: { fillColor: [230, 180, 30] },
    styles: { fontSize: 7 },
  });

  if (estimate.buildings.length > PDF_ROW_LIMIT) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 0;
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Showing first ${PDF_ROW_LIMIT} of ${estimate.buildings.length} buildings — use CSV/Excel export for the full set.`, 14, finalY + 6);
  }

  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    "Battery/EV/financial figures use shared default assumptions (residential, current Delhi tariffs/subsidy). Open a building in the workspace to see figures under custom assumptions.",
    14, doc.internal.pageSize.getHeight() - 8,
  );

  doc.save(reportFilename(estimate, "pdf"));
}
