import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../hooks/useTheme";
import { Button } from "../components/ui/Button";

export function SettingsPage() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Workspace Settings</h2>
          <p className="text-xs text-slate-500 mt-1">Configure profile metadata, aesthetic parameters, and user sessions.</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Profile details</h2>
        <div className="flex items-center gap-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-11 w-11 rounded-lg object-cover" />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-brand-600 text-sm font-bold text-white grid place-items-center">
              {(profile?.display_name || profile?.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{profile?.display_name || "—"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.email}</p>
            <p className="text-[10px] uppercase font-bold tracking-wider text-brand-600 mt-0.5">{profile?.role}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Appearance</h2>
        <p className="text-xs text-slate-400 mb-4">Toggle between dark and light themes for the administration panel.</p>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Theme interface</p>
          <Button variant="secondary" onClick={toggleTheme} className="h-9 text-xs">
            {theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
        <h2 className="mb-1 text-sm font-bold text-slate-900 dark:text-white">Session</h2>
        <p className="text-xs text-slate-400 mb-4">Terminate your current administration token and sign out.</p>
        <Button variant="danger" onClick={signOut} className="h-9 text-xs">Sign out</Button>
      </div>
    </div>
  );
}
