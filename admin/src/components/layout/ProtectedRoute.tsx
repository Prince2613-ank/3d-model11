import { useAuth } from "../../contexts/AuthContext";
import { LoginPage } from "../../pages/LoginPage";
import { NotAuthorizedPage } from "../../pages/NotAuthorizedPage";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const { session, profile, isLoading, isAdmin } = useAuth();

  if (isLoading && session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!session) return <LoginPage />;
  if (!profile || !isAdmin) return <NotAuthorizedPage />;

  return <AdminShell />;
}
