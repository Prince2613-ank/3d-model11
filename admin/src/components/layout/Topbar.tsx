import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead } from "../../hooks/useNotifications";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Topbar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isBellOpen, setIsBellOpen] = useState(false);
  const { data: unread } = useUnreadNotificationCount(true);
  const { data: notifData } = useNotifications(isBellOpen);
  const markRead = useMarkNotificationRead();

  return (
    <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white/70 px-6 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
      <button
        onClick={toggleTheme}
        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? "☀️" : "🌙"}
      </button>

      <div className="relative">
        <button
          onClick={() => setIsBellOpen((open) => !open)}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Notifications"
        >
          🔔
          {!!unread?.count && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread.count > 99 ? "99+" : unread.count}
            </span>
          )}
        </button>

        {isBellOpen && (
          <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="max-h-96 overflow-y-auto p-2">
              {(notifData?.notifications ?? []).length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
              )}
              {notifData?.notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    n.is_read ? "opacity-60" : ""
                  }`}
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">{n.title}</p>
                  {n.body && <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pl-2">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
            {(profile?.display_name || profile?.email || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {profile?.display_name || profile?.email}
        </span>
        <button onClick={signOut} className="ml-2 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          Sign out
        </button>
      </div>
    </header>
  );
}
