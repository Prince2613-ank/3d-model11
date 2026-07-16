import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import type { Profile } from "../types/domain";

const PROFILE_CACHE_KEY = "digital-twin-admin-profile";

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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(readCachedProfile);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionResolved(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setSessionResolved(true);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessionResolved) return;

    if (!session) {
      setProfile(null);
      setProfileLoading(false);
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }

    const hasCurrentProfile = profile?.id === session.user.id;
    if (!hasCurrentProfile) setProfileLoading(true);

    api.get<{ profile: Profile }>("/me")
      .then(({ profile: nextProfile }) => {
        setProfile(nextProfile);
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(nextProfile));
      })
      .catch(() => {
        if (!hasCurrentProfile) setProfile(null);
      })
      .finally(() => setProfileLoading(false));
  }, [sessionResolved, session?.user.id]);

  const currentProfile = session && profile?.id === session.user.id ? profile : null;
  const isLoading = !sessionResolved || Boolean(session && profileLoading && !currentProfile);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  };

  const signOut = async () => {
    setProfile(null);
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
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
