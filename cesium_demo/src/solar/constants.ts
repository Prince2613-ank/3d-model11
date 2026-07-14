export const SOLAR_API_BASE = "http://localhost:4000/api/solar";

// Punjabi Bagh office/house rooftop anchor used when the camera view is too
// broad for a focused solar lookup.
export const SOLAR_CENTER_LAT = 28.670964882901437;
export const SOLAR_CENTER_LON = 77.13370004110053;

// Half-width of the fixed analysis box around the Punjabi Bagh house.
// This covers the nearby building cluster instead of only one roof.
export const DEFAULT_ANALYSIS_RADIUS_M = 400;

// Fixed bounding box covering the whole Punjabi Bagh locality (Rohtak Road
// in the north, Ring Road in the east, past Road Number 41/52/57/61 and
// Herbal Garden/Punjabi Bagh Club to the south, North Ave Road to the west).
// "Analyze" always uses this — not the current camera view — so results are
// consistent regardless of where the user has scrolled/zoomed to.
export const PUNJABI_BAGH_BBOX = {
  minLon: 77.116,
  minLat: 28.657,
  maxLon: 77.151,
  maxLat: 28.678,
};

export type SolarMode = "free" | "google";

export const SOLAR_MODE_LABELS: Record<SolarMode, { label: string; sub: string }> = {
  free: { label: "Free - Open Data", sub: "NASA POWER irradiance + neighbor-shading estimate" },
  google: { label: "Paid - Google Solar", sub: "Google Solar API (billed per lookup, limited coverage)" },
};

// Low -> high rooftop production. The renderer normalizes daily kWh against
// the currently analyzed buildings so roofs show relative production clearly.
export const SOLAR_COLOR_STOPS: { at: number; color: [number, number, number] }[] = [
  { at: 0.0, color: [0.86, 0.15, 0.47] }, // poor - magenta
  { at: 0.4, color: [0.98, 0.45, 0.09] }, // fair - vivid orange
  { at: 0.7, color: [0.98, 0.80, 0.08] }, // good - amber
  { at: 1.0, color: [0.00, 0.59, 0.53] }, // excellent - teal
];

export function colorForProductionScore(score: number): [number, number, number] {
  const stops = SOLAR_COLOR_STOPS;
  const value = Math.max(0, Math.min(1, score));
  if (value <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i].at) {
      const prev = stops[i - 1];
      const cur = stops[i];
      const t = (value - prev.at) / (cur.at - prev.at || 1);
      return [
        prev.color[0] + (cur.color[0] - prev.color[0]) * t,
        prev.color[1] + (cur.color[1] - prev.color[1]) * t,
        prev.color[2] + (cur.color[2] - prev.color[2]) * t,
      ];
    }
  }
  return stops[stops.length - 1].color;
}

export function colorForSpecificYield(kwhPerM2Day: number): [number, number, number] {
  return colorForProductionScore(kwhPerM2Day);
}
