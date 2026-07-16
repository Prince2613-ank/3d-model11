import { useEffect, useRef, useState } from "react";
import { useNotifications } from "../../hooks/useNotifications";
import type { Notification } from "../../types/domain";

export function NotificationToasts() {
  const { data } = useNotifications(true);
  const initialized = useRef(false);
  const knownIds = useRef(new Set<string>());
  const [toasts, setToasts] = useState<Notification[]>([]);

  useEffect(() => {
    const notifications = data?.notifications;
    if (!notifications) return;
    if (!initialized.current) {
      knownIds.current = new Set(notifications.map((item) => item.id));
      initialized.current = true;
      return;
    }

    const arrivals = notifications.filter((item) => !knownIds.current.has(item.id));
    knownIds.current = new Set(notifications.map((item) => item.id));
    if (arrivals.length === 0) return;

    setToasts((current) => [...arrivals.slice(0, 3), ...current].slice(0, 4));
    arrivals.forEach((item) => window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== item.id));
    }, 7500));
  }, [data?.notifications]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-3 top-20 z-[120] flex w-[min(390px,calc(100vw-24px))] flex-col gap-2 sm:right-5 sm:top-24" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className="pointer-events-auto overflow-hidden rounded-2xl border border-indigo-200/70 bg-white/95 shadow-[0_18px_60px_rgba(15,23,42,.22)] backdrop-blur-xl dark:border-indigo-500/25 dark:bg-slate-900/95">
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
          <div className="flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-lg text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{toast.type === "direct_message" ? "✉" : toast.type === "announcement" ? "📣" : "!"}</span>
            <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.15em] text-indigo-500">New notification</p><h3 className="mt-1 text-sm font-extrabold text-slate-900 dark:text-white">{toast.title}</h3>{toast.body && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{toast.body}</p>}</div>
            <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="h-7 w-7 shrink-0 rounded-lg text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10" aria-label="Dismiss notification">×</button>
          </div>
        </article>
      ))}
    </div>
  );
}
