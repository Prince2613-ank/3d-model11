import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../hooks/useTheme";
import { useNotifications, useUnreadNotificationCount, useMarkNotificationRead } from "../../hooks/useNotifications";
import { api } from "../../lib/api";
import type { Complaint, ComplaintHistoryEntry, Notification } from "../../types/domain";

const TITLES: Record<string, string> = {
  "/": "Operations overview", "/building": "Building management", "/rooms": "Rooms & spaces",
  "/assets": "Employee workspace", "/complaints": "Complaint desk", "/users": "Users & access",
  "/announcements": "Announcements", "/reports": "Reports & insights", "/settings": "Workspace settings",
};

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
  const [detail, setDetail] = useState<Notification | null>(null);
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [history, setHistory] = useState<ComplaintHistoryEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const { data: unread } = useUnreadNotificationCount(true);
  const { data: notifData } = useNotifications(isBellOpen);
  const markRead = useMarkNotificationRead();

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) setIsBellOpen(false);
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
    <header className="relative z-30 flex h-[68px] shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 bg-white/80 px-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75 sm:h-[82px] sm:px-6 lg:px-8">
      <div className="min-w-0">
        <div className="hidden items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-indigo-500 min-[360px]:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/> Live workspace</div>
        <h1 className="truncate text-[15px] font-extrabold tracking-tight text-slate-900 dark:text-white min-[360px]:mt-1 sm:text-lg">{TITLES[pathname] ?? "Digital Twin Admin"}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        <button onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 sm:h-10 sm:w-10" aria-label="Toggle theme">
          {theme === "dark" ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.41M17.66 6.34l1.41-1.41"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>}
        </button>

        <div className="relative" ref={bellRef}>
          <button onClick={() => setIsBellOpen((open) => !open)} className={`relative grid h-9 w-9 place-items-center rounded-xl border bg-white shadow-sm transition hover:-translate-y-0.5 dark:bg-slate-900 sm:h-10 sm:w-10 ${isBellOpen ? "border-indigo-300 text-indigo-600" : "border-slate-200 text-slate-500 hover:border-indigo-200 hover:text-indigo-600 dark:border-white/10 dark:text-slate-300"}`} aria-label="Notifications">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
            {!!unread?.count && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black text-white dark:border-slate-950">{unread.count > 99 ? "99+" : unread.count}</span>}
          </button>

          {isBellOpen && (
            <div className="absolute right-0 mt-3 w-[min(370px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,.22)] dark:border-white/10 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-white/10 dark:bg-white/5"><div><p className="text-sm font-extrabold text-slate-900 dark:text-white">Notifications</p><p className="text-[11px] text-slate-400">Live operational updates</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{unread?.count ?? 0} unread</span></div>
              <div className="max-h-[430px] overflow-y-auto p-2">
                {(notifData?.notifications ?? []).length === 0 && <div className="px-3 py-10 text-center"><div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-white/5"><svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/></svg></div><p className="text-sm font-semibold text-slate-500">You are all caught up</p></div>}
                {notifData?.notifications.map((n) => (
                  <button key={n.id} onClick={() => void openDetail(n)} className={`relative block w-full rounded-xl px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-white/5 ${n.is_read ? "opacity-60" : ""}`}>
                    {!n.is_read && <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-indigo-500"/>}
                    <p className="pr-5 text-sm font-bold text-slate-800 dark:text-slate-100">{n.title}</p>
                    {n.body && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{n.body}</p>}
                    <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{timeAgo(n.created_at)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ml-0.5 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:ml-1 sm:rounded-2xl sm:py-1.5 sm:pl-1.5 sm:pr-3">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-8 w-8 rounded-lg object-cover sm:h-9 sm:w-9 sm:rounded-xl" /> : <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 text-xs font-black text-white sm:h-9 sm:w-9 sm:rounded-xl">{(profile?.display_name || profile?.email || "?").slice(0, 1).toUpperCase()}</div>}
          <div className="hidden max-w-36 sm:block"><p className="truncate text-xs font-bold text-slate-800 dark:text-white">{profile?.display_name || profile?.email}</p><p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">Administrator</p></div>
          <button onClick={signOut} className="hidden rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 lg:block">Sign out</button>
        </div>
      </div>

      {detail && createPortal((
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
          <button className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setDetail(null)} aria-label="Close details" />
          <article className="relative flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-white/20 bg-white shadow-[0_32px_100px_rgba(2,6,23,.4)] dark:bg-slate-900 sm:max-h-[min(760px,calc(100dvh-48px))] sm:rounded-[28px]">
            <header className="relative flex shrink-0 items-start gap-3 bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 px-4 py-5 text-white sm:gap-4 sm:px-6 sm:py-6">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/10 text-xl font-black">{detail.type === "announcement" ? "📣" : "!"}</div>
              <div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-[.18em] text-indigo-300">{detail.type.replaceAll("_", " ")}</p><h2 id="notification-detail-title" className="mt-1 break-words text-lg font-black tracking-tight sm:text-xl">{detail.title}</h2><p className="mt-1 text-[11px] font-medium text-indigo-200">{new Date(detail.created_at).toLocaleString()}</p></div>
              <button onClick={() => setDetail(null)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10 text-sm hover:bg-white/20" aria-label="Close">✕</button>
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
                {history.length > 0 && <section><h3 className="mb-3 text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Activity timeline</h3><div className="space-y-3 border-l-2 border-indigo-100 pl-5 dark:border-indigo-500/20">{history.map((entry) => <div key={entry.id} className="relative"><span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-50 dark:ring-slate-900"/><p className="text-sm font-bold capitalize text-slate-700 dark:text-slate-200">{entry.to_status ? `Status changed to ${entry.to_status}` : "Complaint updated"}</p><p className="mt-1 text-[10px] font-medium text-slate-400">{new Date(entry.created_at).toLocaleString()}</p>{entry.note && <p className="mt-1 text-xs leading-5 text-slate-500">{entry.note}</p>}</div>)}</div></section>}
              </>}
            </div>
          </article>
        </div>
      ), document.body)}
    </header>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-indigo-50 px-3 py-3 dark:bg-indigo-500/10"><p className="text-[9px] font-black uppercase tracking-wider text-indigo-400">{label}</p><p className="mt-1 truncate text-xs font-extrabold capitalize text-indigo-900 dark:text-indigo-200">{value}</p></div>;
}

function DetailSection({ title, body }: { title: string; body: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[.03]"><h3 className="text-[10px] font-black uppercase tracking-[.13em] text-slate-400">{title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p></section>;
}
