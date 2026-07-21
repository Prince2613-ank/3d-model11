import { useAuth } from "../../contexts/AuthContext";
import { LoginPage } from "../../pages/LoginPage";
import { NotAuthorizedPage } from "../../pages/NotAuthorizedPage";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const { session, profile, isLoading, isAdmin } = useAuth();

  if (!session) return <LoginPage />;

  // Once Supabase has restored the authenticated session, render the workspace
  // immediately. The profile/admin check finishes silently while protected API
  // requests continue to enforce authorization on the server.
  if (isLoading) return <AdminShell />;

  if (!profile || !isAdmin) return <NotAuthorizedPage />;

  return <AdminShell />;
}
