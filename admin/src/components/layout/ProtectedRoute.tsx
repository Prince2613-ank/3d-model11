import { useEffect } from "react";
import { useAuth, SESSION_EXPIRED_MESSAGE_KEY } from "../../contexts/AuthContext";
import { LoginPage } from "../../pages/LoginPage";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const { session, profile, isLoading, isAdmin, signOut } = useAuth();

  // A signed-in Google account that isn't the allowlisted admin (see
  // isAllowedAdminEmail on the backend — the actual authorization boundary,
  // this is just the matching UX) gets signed out immediately and bounced
  // back to the login screen with an explanation, rather than left sitting
  // on a dead-end "not authorized" page.
  useEffect(() => {
    if (session && profile && !isAdmin) {
      try {
        window.sessionStorage.setItem(
          SESSION_EXPIRED_MESSAGE_KEY,
          `${profile.email} does not have admin access to this workspace.`
        );
      } catch { /* ignore */ }
      void signOut();
    }
  }, [session, profile, isAdmin, signOut]);

  // `isLoading` covers two phases: (1) Supabase hasn't finished asking
  // localStorage/the network whether a persisted session exists yet, and
  // (2) a session exists but its profile is still being fetched. Checking
  // `session` before this used to flash the login page on every refresh —
  // `session` starts out `null` and only gets set once getSession() resolves,
  // so a valid returning user would briefly see "logged out" first. Waiting
  // for isLoading first renders the workspace shell through both phases; the
  // profile/admin check finishes silently while protected API requests
  // continue to enforce authorization on the server either way.
  if (isLoading) return <AdminShell />;

  if (!session || !profile || !isAdmin) return <LoginPage />;

  return <AdminShell />;
}
