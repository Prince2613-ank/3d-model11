import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead, useMarkAllNotificationsRead } from "../../hooks/useNotifications";
import { api } from "../../lib/api";
import type { Complaint, ComplaintHistoryEntry, Notification } from "../../types/domain";

const TITLES: Record<string, string> = {
  "/rooms": "Rooms & spaces",
  "/bookings": "Room bookings", "/assets": "Employee workspace", "/complaints": "Complaint desk", "/users": "Users & access",
  "/announcements": "Announcements", "/reports": "Reports & insights", "/settings": "Workspace settings",
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The bell button isn't flush against the viewport's right edge — the profile
 * avatar sits to its right — so anchoring the notification panel via CSS
 * `right` (relative to the bell) pushes a ~350px-wide panel further left than
 * the screen on mobile, clipping it off the left edge. Clamp an explicit
 * `left` instead so it always fits within the viewport.
 */
function notificationPanelLeft(bellRect: DOMRect): number {
  const panelWidth = Math.min(370, window.innerWidth - 24);
  return Math.max(12, Math.min(bellRect.right - panelWidth, window.innerWidth - panelWidth - 12));
}

const TIMELINE_DOT_CLASS: Record<string, string> = {
  pending: "bg-amber-500 ring-amber-50 dark:ring-amber-500/10",
  assigned: "bg-sky-500 ring-sky-50 dark:ring-sky-500/10",
  resolved: "bg-emerald-500 ring-emerald-50 dark:ring-emerald-500/10",
  rejected: "bg-rose-500 ring-rose-50 dark:ring-rose-500/10",
};

// Older data (created before the backend guarded against re-resolving an
// already-resolved complaint) can contain back-to-back rows for the same
// transition — collapse those so the timeline reads as one event, not two.
function dedupeHistory(history: ComplaintHistoryEntry[]): ComplaintHistoryEntry[] {
  return history.filter((entry, index) => {
    const prev = history[index - 1];
    return !prev || prev.to_status !== entry.to_status || prev.note !== entry.note;
  });
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function Topbar() {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { pathname } = useLocation();
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [bellRect, setBellRect] = useState<DOMRect | null>(null);
  const [detail, setDetail] = useState<Notification | null>(null);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [history, setHistory] = useState<ComplaintHistoryEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const { data: unread } = useUnreadNotificationCount(true);
  const { data: notifData } = useNotifications(isBellOpen);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [markingAllRead, setMarkingAllRead] = useState(false);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!bellRef.current?.contains(target) && !notificationPanelRef.current?.contains(target)) {
        setIsBellOpen(false);
      }
      if (!profileRef.current?.contains(target)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDetail(null); };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [detail]);

  const openDetail = async (notification: Notification) => {
    setDetail(notification);
    setComplaint(null);
    setHistory([]);
    setIsBellOpen(false);
    if (!notification.is_read) await markRead(notification.id);
    if (!notification.related_complaint_id) return;
    setDetailLoading(true);
    try {
      const [complaintData, historyData] = await Promise.all([
        api.get<{ complaint: Complaint }>(`/complaints/${notification.related_complaint_id}`),
        api.get<{ history: ComplaintHistoryEntry[] }>(`/complaints/${notification.related_complaint_id}/history`),
      ]);
      setComplaint(complaintData.complaint);
      setHistory(historyData.history);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <header className="relative z-30 flex h-[76px] shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 dark:border-white/10 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="min-w-0">
        {pathname === "/" ? (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Command Centre</p>
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
              {timeOfDayGreeting()}, {(profile?.display_name || "Admin").split(" ")[0]} 👋
            </h1>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Workspace</p>
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg">
              {TITLES[pathname] || "Flodata Admin"}
            </h1>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Theme Toggle */}
        <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-white/5" aria-label="Toggle theme">
          {theme === "dark" ? <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"/></svg> : <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>}
        </button>

        {/* Notifications */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => {
              if (!isBellOpen && bellRef.current) setBellRect(bellRef.current.getBoundingClientRect());
              setIsBellOpen((open) => !open);
            }}
            className={`relative grid h-9 w-9 place-items-center rounded-lg border bg-white transition dark:bg-slate-900 ${isBellOpen ? "border-brand-300 text-brand-600" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"}`}
            aria-label="Notifications"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
            {!!unread?.count && <span className="absolute -right-1 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full border border-white bg-rose-500 px-1 text-[8px] font-bold text-white dark:border-slate-950">{unread.count > 99 ? "99+" : unread.count}</span>}
          </button>

          {isBellOpen && bellRect && createPortal((
            <div
              ref={notificationPanelRef}
              className="fixed z-[60] w-[min(370px,calc(100vw-24px))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-900"
              style={{ top: bellRect.bottom + 8, left: notificationPanelLeft(bellRect) }}
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/5">
                <div><p className="text-xs font-bold text-slate-900 dark:text-white">Notifications</p><p className="text-[10px] text-slate-400">Live operational updates</p></div>
                {(unread?.count ?? 0) > 0 ? (
                  <button
                    onClick={async () => {
                      setMarkingAllRead(true);
                      try { await markAllRead(); } finally { setMarkingAllRead(false); }
                    }}
                    disabled={markingAllRead}
                    className="shrink-0 rounded bg-brand-600 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
                  >
                    {markingAllRead ? "Marking…" : "Mark all read"}
                  </button>
                ) : (
                  <span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">0 unread</span>
                )}
              </div>
              <div className="max-h-[380px] overflow-y-auto p-2">
                {(notifData?.notifications ?? []).length === 0 && <div className="px-3 py-10 text-center"><div className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5"><svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/></svg></div><p className="text-xs font-semibold text-slate-500">You are all caught up</p></div>}
                {notifData?.notifications.map((n) => (
                  <button key={n.id} onClick={() => void openDetail(n)} className={`relative block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${n.is_read ? "opacity-60" : ""}`}>
                    {!n.is_read && <span className="absolute right-3 top-4.5 h-1.5 w-1.5 rounded-full bg-brand-500"/>}
                    <p className="pr-5 text-xs font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                    {n.body && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{n.body}</p>}
                    <p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{timeAgo(n.created_at)}</p>
                  </button>
                ))}
              </div>
            </div>
          ), document.body)}
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900 dark:hover:bg-white/5 transition"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs font-bold text-white">
                {(profile?.display_name || profile?.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="hidden sm:inline-block text-xs font-semibold text-slate-800 dark:text-slate-200 max-w-24 truncate pl-0.5">
              {(profile?.display_name || profile?.email || "").split(" ")[0]}
            </span>
            <svg viewBox="0 0 24 24" className="h-3 w-3 text-slate-400 mr-1" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{profile?.display_name || profile?.email}</p>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">Administrator</p>
              </div>
              <div className="p-1">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    signOut();
                  }}
                  className="w-full text-left rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {detail && createPortal((
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
          <button className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDetail(null)} aria-label="Close details" />
          <article className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 sm:max-h-[min(760px,calc(100dvh-48px))] sm:rounded-2xl">
            <header className="relative flex shrink-0 items-start gap-3 border-b border-slate-200 bg-slate-50 px-4 py-5 dark:border-white/10 dark:bg-white/5 sm:gap-4 sm:px-6 sm:py-6">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-600 text-xl text-white">{detail.type === "announcement" ? "📣" : "!"}</div>
              <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.18em] text-brand-600 dark:text-brand-300">{detail.type.replaceAll("_", " ")}</p><h2 id="notification-detail-title" className="mt-1 break-words text-lg font-bold tracking-tight text-slate-900 dark:text-white sm:text-xl">{detail.title}</h2><p className="mt-1 text-[11px] font-medium text-slate-400">{new Date(detail.created_at).toLocaleString()}</p></div>
              <button onClick={() => setDetail(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500 hover:bg-slate-100 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300" aria-label="Close">✕</button>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 pb-[max(24px,env(safe-area-inset-bottom))] sm:p-6">
              {detail.body && <DetailSection title={detail.type === "announcement" ? "Full message" : "Latest update"} body={detail.body} />}
              {detailLoading && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-semibold text-slate-400 dark:bg-white/5">Loading complaint details…</div>}
              {complaint && <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailFact label="Status" value={complaint.status}/><DetailFact label="Priority" value={complaint.priority}/><DetailFact label="Issue" value={complaint.issue_type}/><DetailFact label="Assigned" value={complaint.assigned_to_name || "Unassigned"}/></div>
                <DetailSection title="Original complaint" body={complaint.description}/>
                {(complaint.photo_urls?.length ?? 0) > 0 && <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[.03]"><h3 className="mb-3 text-[10px] font-black uppercase tracking-[.13em] text-slate-400">Complaint proof</h3><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{complaint.photo_urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5"><img src={url} alt={`Complaint proof ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105"/><span className="absolute inset-x-2 bottom-2 rounded-md bg-slate-950/70 px-2 py-1 text-center text-[9px] font-bold text-white opacity-0 transition group-hover:opacity-100">Open image</span></a>)}</div></section>}
                {complaint.assigned_notes && <DetailSection title="Assignment notes" body={complaint.assigned_notes}/>} 
                {complaint.admin_reply && <DetailSection title="Admin response" body={complaint.admin_reply}/>} 
                {complaint.resolution_text && <DetailSection title="Resolution" body={complaint.resolution_text}/>} 
                {history.length > 0 && <section><h3 className="mb-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Activity timeline</h3><div className="space-y-4 border-l-2 border-brand-100 pl-5 dark:border-brand-500/20">{dedupeHistory(history).map((entry, index, arr) => { const isLatest = index === arr.length - 1; const dotClass = (entry.to_status && TIMELINE_DOT_CLASS[entry.to_status]) || "bg-brand-500 ring-brand-50 dark:ring-slate-900"; return <div key={entry.id} className="relative"><span className={`absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ${dotClass}`}/><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold capitalize text-slate-700 dark:text-slate-200">{entry.to_status ? `${entry.from_status || "New"} → ${entry.to_status}` : "Complaint updated"}</p>{isLatest && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">Latest</span>}</div><p className="mt-1 text-[10px] font-medium text-slate-400">{new Date(entry.created_at).toLocaleString()}</p>{entry.note && <p className="mt-1.5 rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-xs leading-5 text-slate-600 dark:bg-white/5 dark:text-slate-300">{entry.note}</p>}</div>; })}</div></section>}
              </>}
            </div>
          </article>
        </div>
      ), document.body)}
    </header>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-brand-50 px-3 py-3 dark:bg-brand-500/10"><p className="text-[9px] font-black uppercase tracking-wider text-brand-400">{label}</p><p className="mt-1 truncate text-xs font-extrabold capitalize text-brand-900 dark:text-brand-200">{value}</p></div>;
}

function DetailSection({ title, body }: { title: string; body: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[.03]"><h3 className="text-[10px] font-black uppercase tracking-[.13em] text-slate-400">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p></section>;
}
