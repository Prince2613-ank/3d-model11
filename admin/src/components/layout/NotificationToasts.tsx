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
    <div className="pointer-events-none fixed bottom-[86px] right-3 z-[120] flex w-[min(340px,calc(100vw-24px))] flex-col-reverse gap-1.5 sm:right-5 md:bottom-5" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-3.5 pr-2 text-white shadow-[0_8px_24px_rgba(122,29,255,.35)]"
        >
          <p className="min-w-0 flex-1 truncate text-xs font-semibold">{toast.title}</p>
          <button onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs text-white/80 hover:bg-white/15 hover:text-white" aria-label="Dismiss notification">×</button>
        </div>
      ))}
    </div>
  );
}
