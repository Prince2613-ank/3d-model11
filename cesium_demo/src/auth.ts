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
const listeners = new Set<(user: CurrentUser | null) => void>();
const OAUTH_POPUP_FLAG = "oauth_popup";

interface OAuthPopupSession {
  type: "flodata-oauth-session";
  accessToken: string;
  refreshToken: string;
  providerToken: string | null;
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
  googleProviderToken = data.session?.provider_token ?? googleProviderToken;
  notify();
});

supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
  if (session?.provider_token) googleProviderToken = session.provider_token;
  if (event === "SIGNED_OUT") googleProviderToken = null;
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
  return data.session?.access_token ?? null;
}

/**
 * Google's own OAuth access token for this session (Calendar API scope),
 * as opposed to getAccessToken()'s Supabase JWT. Only populated right after
 * a fresh sign-in — Supabase doesn't refresh provider tokens, so this goes
 * null again once the Google token expires and the user must sign in again.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return googleProviderToken ?? data.session?.provider_token ?? null;
}

export async function signInWithGoogle(): Promise<void> {
  const popup = window.open("about:blank", "flodata-google-signin", "popup=yes,width=520,height=720");
  if (!popup) throw new Error("Google sign-in popup was blocked. Allow popups and try again.");

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
  const popupSession = await sessionPromise;
  googleProviderToken = popupSession.providerToken;
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
