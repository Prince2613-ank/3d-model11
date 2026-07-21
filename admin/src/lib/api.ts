import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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

  let response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401 && token) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      headers.set("Authorization", `Bearer ${refreshedToken}`);
      response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
    }
  }

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
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, body.error || "Upload failed");
    return body;
  }
};
