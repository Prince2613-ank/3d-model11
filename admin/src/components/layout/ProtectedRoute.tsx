import { useAuth } from "../../contexts/AuthContext";
import { LoginPage } from "../../pages/LoginPage";
import { NotAuthorizedPage } from "../../pages/NotAuthorizedPage";
import { AdminShell } from "./AdminShell";

export function ProtectedRoute() {
  const { session, profile, isLoading, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fd] dark:bg-[#07101f]">
        <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/80 px-5 py-4 shadow-lg shadow-slate-200/60 backdrop-blur dark:border-white/10 dark:bg-slate-900/80 dark:shadow-none">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Digital Twin</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Restoring your workspace</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage />;
  if (!profile || !isAdmin) return <NotAuthorizedPage />;

  return <AdminShell />;
}
