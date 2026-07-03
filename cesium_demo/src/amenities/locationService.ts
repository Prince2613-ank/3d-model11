// Wraps the browser Geolocation API with continuous watching.

export interface UserLocation {
  lat: number;
  lon: number;
  accuracy: number; // metres
}

export type LocationCallback = (loc: UserLocation) => void;
export type LocationErrorCallback = (msg: string) => void;

let watchId: number | null = null;

export function startWatchingLocation(
  onUpdate: LocationCallback,
  onError: LocationErrorCallback,
): void {
  if (!navigator.geolocation) {
    onError("Geolocation is not supported by this browser.");
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
    },
    (err) => {
      const msgs: Record<number, string> = {
        1: "Location permission denied. Using building as fallback origin.",
        2: "Location unavailable.",
        3: "Location request timed out.",
      };
      onError(msgs[err.code] ?? "Unknown location error.");
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 },
  );
}

export function stopWatchingLocation(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}
