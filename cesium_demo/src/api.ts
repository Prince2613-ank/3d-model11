import { getAccessToken, refreshAccessToken, signOut } from "./auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Dispatched when a request is still 401 after a fresh-token retry — the
 * session itself is gone (expired, revoked, or the backend's 24h inactivity
 * rule kicked in), not a transient hiccup. main.ts listens for this to show
 * "Your session expired" — sign-in here is optional/contextual (no separate
 * login route), so clearing the session is enough to revert the UI to its
 * signed-out state. */
export const AUTH_EXPIRED_EVENT = "flodata:auth-expired";

// Several requests can 401 around the same moment — only act on the first.
let handlingAuthExpiry = false;
function handleAuthExpired(): void {
  if (handlingAuthExpiry) return;
  handlingAuthExpiry = true;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  void signOut().finally(() => { handlingAuthExpiry = false; });
}

// ── Client-side inactivity deadline ─────────────────────────────────────
// The backend is the source of truth (see backend/src/middleware/auth.ts) —
// this just lets the tab notice locally and sign out proactively. "Activity"
// piggybacks on real authenticated requests already being made (no extra
// event listeners, no extra network calls).
const LAST_ACTIVITY_KEY = "flodata-last-activity";
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 60_000;
let lastActivityWrite = 0;

function recordActivity(): void {
  const now = Date.now();
  if (now - lastActivityWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
  lastActivityWrite = now;
  try { window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now)); } catch { /* storage unavailable — inactivity check just no-ops */ }
}

function checkInactivityDeadline(): void {
  let stored: string | null = null;
  try { stored = window.localStorage.getItem(LAST_ACTIVITY_KEY); } catch { return; }
  if (!stored) return;
  if (Date.now() - Number(stored) > INACTIVITY_LIMIT_MS) handleAuthExpired();
}

window.setInterval(checkInactivityDeadline, 5 * 60 * 1000);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = await getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Asset/complaint information is shared with the admin dashboard. Never use a
  // stale browser-cached response here, otherwise a dashboard edit can appear
  // to be missing in the 3D user panel.
  let response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: options.cache ?? "no-store" });
  if (response.status === 401 && token) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      headers.set("Authorization", `Bearer ${refreshedToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: options.cache ?? "no-store" });
    }
    // Still unauthorized even with a freshly-refreshed token — the session
    // itself is gone server-side, not just a stale access token.
    if (response.status === 401) handleAuthExpired();
  }

  if (response.ok && token) recordActivity();

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(response.status, body.error || `Request failed with status ${response.status}`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),

  async uploadFile(path: string, file: File, fieldName = "photo"): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers = new Headers();
    const token = await getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: formData });
    if (response.status === 401 && token) {
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        headers.set("Authorization", `Bearer ${refreshedToken}`);
        response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: formData });
      }
      if (response.status === 401) handleAuthExpired();
    }
    if (response.ok && token) recordActivity();
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, body.error || "Upload failed");
    return body;
  }
};

export interface AssetDTO {
  id: string;
  object_key: string;
  seat_id: string;
  seat_number: string | null;
  designation: string | null;
  name: string;
  category: string;
  description: string | null;
  image_url: string | null;
  live_status: "ok" | "pending" | "assigned" | "resolved";
  assigned_to_profile_id: string | null;
  assigned_to_name: string | null;
  assigned_employee_name: string | null;
}

export interface RoomDTO {
  id: string;
  floor_id: string;
  name: string;
  department: string | null;
  capacity: number | null;
  manager_name: string | null;
  description: string | null;
  images: string[];
  color: string | null;
  is_visible: boolean;
}
