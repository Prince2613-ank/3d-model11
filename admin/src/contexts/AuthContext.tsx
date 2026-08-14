import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { api, AUTH_EXPIRED_EVENT } from "../lib/api";
import type { Profile } from "../types/domain";

const PROFILE_POLL_INTERVAL_MS = 2 * 60 * 1000;

const PROFILE_CACHE_KEY = "digital-twin-admin-profile";
const GOOGLE_TOKEN_CACHE_KEY = "digital-twin-admin-google-calendar-token";
const GOOGLE_TOKEN_LIFETIME_MS = 50 * 60 * 1000;
export const SESSION_EXPIRED_MESSAGE_KEY = "digital-twin-admin-session-expired-message";

function cacheGoogleToken(token: string | null): void {
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
      cacheGoogleToken(null);
      return null;
    }
    return cached.token;
  } catch {
    cacheGoogleToken(null);
    return null;
  }
}

function readCachedProfile(): Profile | null {
  try {
    const value = window.localStorage.getItem(PROFILE_CACHE_KEY);
    return value ? (JSON.parse(value) as Profile) : null;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  getGoogleAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(readCachedProfile);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const queryClient = useQueryClient();
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.provider_token) cacheGoogleToken(data.session.provider_token);
      setSessionResolved(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.provider_token) cacheGoogleToken(nextSession.provider_token);
      setSessionResolved(true);
      if (event === "SIGNED_OUT") {
        cacheGoogleToken(null);
        setProfile(null);
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  // api.ts dispatches this when a request is still 401 after a fresh-token
  // retry (session expired/revoked, or the backend's 24h inactivity rule).
  // The actual sign-out already happened there; this just leaves a message
  // for the login screen to show once the SIGNED_OUT listener above clears
  // session/profile state and ProtectedRoute swaps in <LoginPage />.
  useEffect(() => {
    const onAuthExpired = () => {
      try { window.sessionStorage.setItem(SESSION_EXPIRED_MESSAGE_KEY, "Your session expired. Please log in again."); } catch { /* ignore */ }
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
  }, []);

  // Fetches /me and applies the result. `silent` skips the loading spinner —
  // used for background refreshes (poll/focus) so an admin whose role was
  // just changed elsewhere doesn't see the whole shell flash to a loader.
  const refreshProfile = useCallback((currentSession: Session, silent = false) => {
    const prevProfile = profileRef.current;
    const hasCurrentProfile = prevProfile?.id === currentSession.user.id;
    if (!hasCurrentProfile && !silent) setProfileLoading(true);

    api.get<{ profile: Profile }>("/me")
      .then(({ profile: nextProfile }) => {
        setProfile(nextProfile);
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
        // A role/active-state change (e.g. an employee just promoted to
        // admin) should be reflected across the app immediately rather
        // than waiting for each page's own staleTime to expire.
        if (!hasCurrentProfile || prevProfile?.role !== nextProfile.role || prevProfile?.is_active !== nextProfile.is_active) {
          void queryClient.invalidateQueries();
        }
      })
      .catch(() => {
        if (!hasCurrentProfile) setProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [queryClient]);

  useEffect(() => {
    if (!sessionResolved) return;

    if (!session) {
      setProfile(null);
      setProfileLoading(false);
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }

    refreshProfile(session);
  }, [sessionResolved, session?.user.id]);

  // Catches two cases the mount-time fetch above misses: an admin's role
  // changing while their tab stays open (polling), and a session that went
  // stale while the tab was backgrounded/asleep (focus/visibility).
  useEffect(() => {
    if (!session) return;

    const onFocus = () => refreshProfile(session, true);
    const onVisibility = () => { if (document.visibilityState === "visible") refreshProfile(session, true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const poll = window.setInterval(() => refreshProfile(session, true), PROFILE_POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(poll);
    };
  }, [session, refreshProfile]);

  const currentProfile = session && profile?.id === session.user.id ? profile : null;
  const isLoading = !sessionResolved || Boolean(session && profileLoading && !currentProfile);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        // Calendar scope lets the Bookings page read/cancel room bookings via
        // the signed-in admin's own Google account (see lib/googleCalendar.ts).
        scopes: "https://www.googleapis.com/auth/calendar.events",
        // "select_account" (not "consent") — Google only re-shows the data-access
        // permissions screen the first time these scopes are granted; returning
        // users just pick an account and land straight back in, no forced re-consent.
        queryParams: { access_type: "offline", prompt: "select_account" }
      }
    });
  };

  // Google's own OAuth token (Calendar scope), as opposed to the Supabase JWT in
  // `session`. Supabase only returns this right after a fresh sign-in — it isn't
  // persisted across reloads, so it goes null again until the user reconnects.
  const getGoogleAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.provider_token) {
      cacheGoogleToken(data.session.provider_token);
      return data.session.provider_token;
    }
    return readCachedGoogleToken();
  };

  const signOut = async () => {
    setProfile(null);
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
    cacheGoogleToken(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        profile: currentProfile,
        isLoading,
        isAdmin: currentProfile?.role === "admin",
        signInWithGoogle,
        getGoogleAccessToken,
        signOut
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
