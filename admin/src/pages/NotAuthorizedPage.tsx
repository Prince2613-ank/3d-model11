import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";

export function NotAuthorizedPage() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {profile?.email} does not have admin access to this dashboard.
        </p>
        <Button variant="secondary" onClick={signOut} className="mt-6 w-full">
          Sign out
        </Button>
      </div>
    </div>
  );
}
