// Thin React wrapper around the existing solar data engine
// (solar/solarService.ts + solar/solarRenderer.ts) — no calculation logic
// lives here, just state management for the workspace UI.

import { useCallback, useRef, useState } from "react";
import { SolarMode, PUNJABI_BAGH_BBOX } from "../../solar/constants";
import { fetchSolarEstimate, SolarAreaEstimate } from "../../solar/solarService";
import { renderSolarEstimates, clearSolarEntities } from "../../solar/solarRenderer";

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
      const result = await fetchSolarEstimate(PUNJABI_BAGH_BBOX, date, mode);
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
