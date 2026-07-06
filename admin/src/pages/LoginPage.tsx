import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/80 p-8 text-center shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-indigo-600" />
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Digital Twin Admin</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in to manage the building.</p>
        <Button onClick={signInWithGoogle} className="mt-6 w-full">
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
