import { createClient, Session, User } from "@supabase/supabase-js";

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
const listeners = new Set<(user: CurrentUser | null) => void>();

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
  notify();
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentSession = session;
  notify();
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

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin }
  });
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
