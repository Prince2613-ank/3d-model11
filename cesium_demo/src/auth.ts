import { createClient, Session, User } from "@supabase/supabase-js";
import { ALLOWED_DOMAIN } from "./config";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn("[auth] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — sign-in will not work until configured.");
}

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key"
);

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

let currentSession: Session | null = null;
let googleProviderToken: string | null = null;
let freshGoogleSignIn = false;
const listeners = new Set<(user: CurrentUser | null) => void>();
const OAUTH_POPUP_FLAG = "oauth_popup";
const GOOGLE_TOKEN_CACHE_KEY = "flodata-google-calendar-token";
const GOOGLE_TOKEN_LIFETIME_MS = 50 * 60 * 1000;
let refreshPromise: Promise<string | null> | null = null;

interface OAuthPopupSession {
  type: "flodata-oauth-session";
  accessToken: string;
  refreshToken: string;
  providerToken: string | null;
}

function cacheGoogleToken(token: string | null): void {
  googleProviderToken = token;
  if (!token) {
    window.sessionStorage.removeItem(GOOGLE_TOKEN_CACHE_KEY);
    return;
  }
  window.sessionStorage.setItem(GOOGLE_TOKEN_CACHE_KEY, JSON.stringify({
    token,
    expiresAt: Date.now() + GOOGLE_TOKEN_LIFETIME_MS
  }));
}

function readCachedGoogleToken(): string | null {
  try {
    const raw = window.sessionStorage.getItem(GOOGLE_TOKEN_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { token?: string; expiresAt?: number };
    if (!cached.token || !cached.expiresAt || cached.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(GOOGLE_TOKEN_CACHE_KEY);
      return null;
    }
    return cached.token;
  } catch {
    window.sessionStorage.removeItem(GOOGLE_TOKEN_CACHE_KEY);
    return null;
  }
}

googleProviderToken = readCachedGoogleToken();

export function consumeFreshGoogleSignIn(): boolean {
  const value = freshGoogleSignIn;
  freshGoogleSignIn = false;
  return value;
}

export function isOAuthPopupCallback(): boolean {
  return new URLSearchParams(window.location.search).get(OAUTH_POPUP_FLAG) === "1";
}

function toCurrentUser(user: User | undefined): CurrentUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? "",
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User",
    avatarUrl: user.user_metadata?.avatar_url ?? null
  };
}

supabase.auth.getSession().then(({ data }) => {
  currentSession = data.session;
  if (data.session?.provider_token) cacheGoogleToken(data.session.provider_token);
  notify();
});

supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (session?.provider_token) cacheGoogleToken(session.provider_token);
  if (event === "SIGNED_OUT") cacheGoogleToken(null);
  notify();

  if (session && isOAuthPopupCallback() && window.opener) {
    const message: OAuthPopupSession = {
      type: "flodata-oauth-session",
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      providerToken: session.provider_token ?? null
    };
    window.opener.postMessage(message, window.location.origin);
    window.setTimeout(() => window.close(), 80);
  }
});

function notify(): void {
  const user = toCurrentUser(currentSession?.user);
  listeners.forEach((listener) => listener(user));
}

export function onAuthChange(listener: (user: CurrentUser | null) => void): () => void {
  listeners.add(listener);
  listener(toCurrentUser(currentSession?.user));
  return () => listeners.delete(listener);
}

export function getCurrentUser(): CurrentUser | null {
  return toCurrentUser(currentSession?.user);
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiresSoon = !session.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
  if (!expiresSoon) return session.access_token;
  return refreshAccessToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return null;
    currentSession = data.session;
    notify();
    return data.session.access_token;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/**
 * Google's own OAuth access token for this session (Calendar API scope),
 * as opposed to getAccessToken()'s Supabase JWT. Only populated right after
 * a fresh sign-in — Supabase doesn't refresh provider tokens, so this goes
 * null again once the Google token expires and the user must sign in again.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = googleProviderToken ?? data.session?.provider_token ?? readCachedGoogleToken();
  if (token && token !== googleProviderToken) cacheGoogleToken(token);
  return token;
}

export async function signInWithGoogle(): Promise<void> {
  freshGoogleSignIn = true;
  const popup = window.open("about:blank", "flodata-google-signin", "popup=yes,width=520,height=720");
  if (!popup) {
    freshGoogleSignIn = false;
    throw new Error("Google sign-in popup was blocked. Allow popups and try again.");
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/?${OAUTH_POPUP_FLAG}=1`,
      skipBrowserRedirect: true,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        hd: ALLOWED_DOMAIN
      }
    }
  });

  if (error || !data.url) {
    freshGoogleSignIn = false;
    popup.close();
    throw error ?? new Error("Google sign-in could not be started.");
  }

  const sessionPromise = new Promise<OAuthPopupSession>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Google sign-in timed out.")), 120_000);
    const closedCheck = window.setInterval(() => {
      if (popup.closed) finish(new Error("Google sign-in was cancelled."));
    }, 300);

    const onMessage = (event: MessageEvent<OAuthPopupSession>) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.type !== "flodata-oauth-session") return;
      finish(null, event.data);
    };

    function finish(errorToReport: Error | null, session?: OAuthPopupSession): void {
      window.clearTimeout(timeout);
      window.clearInterval(closedCheck);
      window.removeEventListener("message", onMessage);
      if (errorToReport) reject(errorToReport);
      else if (session) resolve(session);
    }

    window.addEventListener("message", onMessage);
  });

  popup.location.replace(data.url);
  let popupSession: OAuthPopupSession;
  try {
    popupSession = await sessionPromise;
  } catch (error) {
    freshGoogleSignIn = false;
    throw error;
  }
  cacheGoogleToken(popupSession.providerToken);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: popupSession.accessToken,
    refresh_token: popupSession.refreshToken
  });
  popup.close();
  if (sessionError) throw sessionError;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

// Supabase's background auto-refresh timer is throttled/paused for a
// backgrounded or sleeping tab, so a token can go stale while the viewer sits
// idle. Proactively refreshing as soon as the tab regains focus means the
// next data request succeeds on the first try instead of silently failing
// (or paying for an extra refresh-and-retry round trip).
async function refreshIfStale(): Promise<void> {
  if (!currentSession) return;
  const expiresSoon = !currentSession.expires_at || currentSession.expires_at * 1000 <= Date.now() + 60_000;
  if (expiresSoon) await refreshAccessToken();
}

window.addEventListener("focus", () => void refreshIfStale());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refreshIfStale();
});
window.addEventListener("online", () => void refreshIfStale());
