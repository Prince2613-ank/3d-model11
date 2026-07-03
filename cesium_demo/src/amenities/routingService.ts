// OSRM open-source routing — walking, driving, cycling.
// Free tier at router.project-osrm.org covers global OSM data.

import { RouteMode, ROUTE_MODES } from "./constants";

export interface RouteResult {
  distanceM: number;
  durationSec: number;
  coords: [number, number][]; // [lon, lat] ordered pairs
}

export async function fetchRoute(
  fromLat: number, fromLon: number,
  toLat: number,   toLon: number,
  mode: RouteMode,
): Promise<RouteResult> {
  const profile = ROUTE_MODES.find((m) => m.key === mode)?.osrmProfile ?? "foot";
  const url =
    `https://router.project-osrm.org/route/v1/${profile}` +
    `/${fromLon},${fromLat};${toLon},${toLat}` +
    `?overview=full&geometries=geojson`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

  const data = await res.json() as any;
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(data.message ?? "No route found");
  }

  const route = data.routes[0];
  return {
    distanceM:   route.distance,
    durationSec: route.duration,
    coords: route.geometry.coordinates as [number, number][],
  };
}

export function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export function fmtDuration(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/** Haversine great-circle distance in metres */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
