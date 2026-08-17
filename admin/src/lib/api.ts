import { supabase } from "./supabase";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");

/** Dispatched when a request is still 401 after a fresh-token retry — i.e.
 * the session itself is gone (expired, revoked, or the backend's 24h
 * inactivity rule kicked in), not a transient hiccup. AuthContext listens
 * for this to surface "Your session expired" on the next login screen. */
export const AUTH_EXPIRED_EVENT = "flodata-admin:auth-expired";

// Several requests can 401 around the same moment (e.g. a burst of queries
// on page load) — only act on the first one so we don't call signOut/dispatch
// the event redundantly for each.
let handlingAuthExpiry = false;
function handleAuthExpired(): void {
  if (handlingAuthExpiry) return;
  handlingAuthExpiry = true;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  // "local" scope — must not revoke every other device signed into this
  // account (the default "global" scope would).
  void supabase.auth.signOut({ scope: "local" }).finally(() => { handlingAuthExpiry = false; });
}

// ── Client-side inactivity deadline ─────────────────────────────────────
// The backend is the source of truth (see auth.ts middleware) — this just
// lets the tab notice locally and sign out proactively, rather than only
// finding out the next time it happens to call the API. "Activity" piggybacks
// on real authenticated requests the app is already making (no extra event
// listeners, no extra network calls), matched to the same 24h window the
// backend enforces.
const LAST_ACTIVITY_KEY = "flodata-admin-last-activity";
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

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { data, error } = await supabase.auth.refreshSession();
    return error || !data.session ? null : data.session.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// Supabase's background auto-refresh runs on a timer that browsers throttle
// or pause entirely for backgrounded/inactive tabs, so a session can go stale
// without the client noticing. Checking expiry (with a lead time) before every
// request, and retrying once against a freshly-refreshed token on a 401,
// keeps requests from silently failing after the tab has been idle.
async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiresSoon = !session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
  if (!expiresSoon) return session.access_token;
  return (await refreshAccessToken()) ?? session.access_token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = await getFreshAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  // Admin records are edited from several panels. Avoid reusing a stale list
  // response after a destructive action such as complaint deletion.
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
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  async uploadFile(path: string, file: File, fieldName = "photo"): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers = new Headers();
    const token = await getFreshAccessToken();
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
