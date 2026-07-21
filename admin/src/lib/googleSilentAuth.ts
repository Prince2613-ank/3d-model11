declare const google: any;

// Same OAuth client already registered (with localhost:5500/5600 as Authorized
// JavaScript origins) for this project's Supabase "Google" provider — public
// client IDs aren't secret, so it's fine to reference directly here.
const GOOGLE_CLIENT_ID = "714313018125-cki9pshrn36v873rarp3ol32kcrlbukn.apps.googleusercontent.com";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

let gisScriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  gisScriptPromise ??= new Promise((resolve, reject) => {
    if ((globalThis as any).google?.accounts?.oauth2) { resolve(); return; }
    const id = "google-gsi-client";
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.id = id;
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services script"));
    document.head.appendChild(script);
  });
  return gisScriptPromise;
}

/**
 * Silently mints a fresh Calendar-scoped Google access token in the background
 * — no popup, no redirect. Works as long as the browser still has an active
 * Google session (true whenever the user is signed into Gmail), which covers
 * the common case where Supabase's own provider_token has gone stale (Supabase
 * doesn't persist or refresh that token across page reloads on its own).
 * Resolves to null if Google requires interactive consent (first-ever grant,
 * revoked access, etc.) — callers should fall back to an explicit sign-in.
 */
export async function silentlyRefreshGoogleToken(loginHint?: string): Promise<string | null> {
  try {
    await loadGisScript();
  } catch (error) {
    console.warn("[googleSilentAuth] Failed to load Google Identity Services:", error);
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: CALENDAR_SCOPE,
        hint: loginHint,
        prompt: "",
        callback: (response: { access_token?: string; error?: string }) => {
          settle(response.access_token ?? null);
        },
        error_callback: () => settle(null),
      });
      client.requestAccessToken({ prompt: "" });
    } catch (error) {
      console.warn("[googleSilentAuth] Silent token request failed:", error);
      settle(null);
    }

    // The silent flow should resolve almost instantly — don't hang forever if it doesn't.
    window.setTimeout(() => settle(null), 4000);
  });
}
