// Thin React wrapper around the existing solar data engine
// (solar/solarService.ts + solar/solarRenderer.ts) — no calculation logic
// lives here, just state management for the workspace UI.

import { useCallback, useRef, useState } from "react";
import { Cesium, viewer } from "../../viewer";
import { SolarMode } from "../../solar/constants";
import { fetchSolarEstimate, bboxAround, SolarAreaEstimate, BBox } from "../../solar/solarService";
import { renderSolarEstimates, clearSolarEntities } from "../../solar/solarRenderer";
import { SOLAR_CENTER_LAT, SOLAR_CENTER_LON, DEFAULT_ANALYSIS_RADIUS_M } from "../../solar/constants";

function currentViewBbox(): BBox {
  const rect = viewer.camera.computeViewRectangle();
  if (rect) {
    const toDeg = Cesium.Math.toDegrees;
    const width = toDeg(rect.east) - toDeg(rect.west);
    const height = toDeg(rect.north) - toDeg(rect.south);
    // Only trust the camera rectangle when it's a tight neighborhood view —
    // at far zoom levels it can span kilometres and blow up per-building
    // analysis cost (especially the billed Google path).
    if (width > 0 && width < 0.02 && height > 0 && height < 0.02) {
      return { minLon: toDeg(rect.west), minLat: toDeg(rect.south), maxLon: toDeg(rect.east), maxLat: toDeg(rect.north) };
    }
  }
  return bboxAround(SOLAR_CENTER_LAT, SOLAR_CENTER_LON, DEFAULT_ANALYSIS_RADIUS_M);
}

export interface UseSolarAnalysis {
  estimate: SolarAreaEstimate | null;
  loading: boolean;
  error: string | null;
  runAnalysis: (date: string, mode: SolarMode) => Promise<void>;
  clear: () => void;
}

export function useSolarAnalysis(): UseSolarAnalysis {
  const [estimate, setEstimate] = useState<SolarAreaEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const runAnalysis = useCallback(async (date: string, mode: SolarMode) => {
    const thisRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const bbox = currentViewBbox();
      const result = await fetchSolarEstimate(bbox, date, mode);
      if (thisRequest !== requestId.current) return; // a newer request superseded this one
      setEstimate(result);
      renderSolarEstimates(result.buildings);
    } catch (err) {
      if (thisRequest !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Solar analysis failed");
    } finally {
      if (thisRequest === requestId.current) setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    requestId.current++; // invalidate any in-flight request
    clearSolarEntities();
    setEstimate(null);
    setError(null);
  }, []);

  return { estimate, loading, error, runAnalysis, clear };
}
