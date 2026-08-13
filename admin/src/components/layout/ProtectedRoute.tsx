import { useAuth } from "../../contexts/AuthContext";
import { LoginPage } from "../../pages/LoginPage";
import { NotAuthorizedPage } from "../../pages/NotAuthorizedPage";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const { session, profile, isLoading, isAdmin } = useAuth();

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

  if (!session) return <LoginPage />;

  if (!profile || !isAdmin) return <NotAuthorizedPage />;

  return <AdminShell />;
}
