import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { Button } from "../components/ui/Button";

export function SettingsPage() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Settings</h1>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Profile</h2>
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-12 w-12 rounded-full" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
          )}
          <div>
            <p className="font-medium text-slate-800 dark:text-slate-100">{profile?.display_name || "—"}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{profile?.email}</p>
            <p className="text-xs uppercase tracking-wide text-indigo-500">{profile?.role}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Appearance</h2>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">Theme</p>
          <Button variant="secondary" onClick={toggleTheme}>
            {theme === "dark" ? "Switch to Light" : "Switch to Dark"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Session</h2>
        <Button variant="danger" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  );
}
