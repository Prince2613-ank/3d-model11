import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ComplaintWithAsset, DashboardStats } from "../types/domain";
import { Skeleton } from "../components/ui/Skeleton";

const panel = "min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_28px_rgba(39,52,86,.06)] dark:border-white/10 dark:bg-slate-900";

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function dayName(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

function Icon({ name }: { name: "alert" | "check" | "clock" | "floor" | "refresh" | "arrow" | "announce" | "users" }) {
  const paths = {
    alert: <><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.6 2.4 17.3A2 2 0 0 0 4.1 20h15.8a2 2 0 0 0 1.7-2.7L13.7 3.6a2 2 0 0 0-3.4 0Z"/></>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.7 2.7L16.5 9"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    floor: <><path d="m4 9 8-5 8 5-8 5-8-5Z"/><path d="m4 14 8 5 8-5"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
    arrow: <path d="m9 18 6-6-6-6"/>,
    announce: <><path d="m3 11 18-5v12L3 14v-3Z"/><path d="m8 15 1 5h4l-1.5-6"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2M17 7a3 3 0 0 1 0 6M18 14a4 4 0 0 1 3 4v2"/></>
  };
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const priorityStyle = {
  critical: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/20",
  high: "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/20",
  medium: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20",
  low: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/10"
};

export function DashboardPage() {
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const statsQuery = useQuery({ queryKey: ["stats", "dashboard"], queryFn: () => api.get<DashboardStats>("/stats/dashboard") });
  const complaintsQuery = useQuery({ queryKey: ["dashboard", "recent-complaints"], queryFn: () => api.get<{ complaints: ComplaintWithAsset[] }>("/complaints?page=1&pageSize=10") });
  const data = statsQuery.data;
  const complaints = complaintsQuery.data?.complaints ?? [];
  const activeComplaints = useMemo(() => complaints.filter((item) => item.status === "pending" || item.status === "assigned"), [complaints]);
  const urgentComplaints = useMemo(() => [...activeComplaints].sort((a, b) => {
    const rank = { critical: 4, high: 3, medium: 2, low: 1 };
    return rank[b.priority] - rank[a.priority] || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }).slice(0, 5), [activeComplaints]);
  const totalToday = (data?.openComplaints ?? 0) + (data?.resolvedToday ?? 0);
  const completionRate = totalToday ? Math.round(((data?.resolvedToday ?? 0) / totalToday) * 100) : 0;
  const maxTrend = Math.max(...(data?.dailyTrends.map((item) => item.complaint_count) ?? [1]), 1);
  const maxFloor = Math.max(...(data?.topFloors.map((item) => item.complaint_count) ?? [1]), 1);
  const isRefreshing = statsQuery.isFetching || complaintsQuery.isFetching;

  const refresh = async () => {
    await Promise.all([statsQuery.refetch(), complaintsQuery.refetch()]);
    setLastUpdated(new Date());
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden pb-7 sm:space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-4 dark:border-indigo-500/20 dark:from-indigo-950/50 dark:via-slate-900 dark:to-violet-950/40 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.12)]"/><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-600 dark:text-emerald-400">Live operations</p></div><h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 dark:text-white">Building operations overview</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Prioritize active issues, monitor service performance, and move work forward.</p></div>
        <button onClick={() => void refresh()} disabled={isRefreshing} className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><span className={isRefreshing ? "animate-spin" : ""}><Icon name="refresh"/></span><span>{isRefreshing ? "Refreshing" : "Refresh data"}</span><span className="hidden text-[10px] font-medium text-slate-400 sm:inline">· {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></button>
      </section>

      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Open complaints" value={data?.openComplaints ?? 0} detail={activeComplaints.filter((item) => item.priority === "critical" || item.priority === "high").length ? `${activeComplaints.filter((item) => item.priority === "critical" || item.priority === "high").length} high priority` : "No urgent items"} icon="alert" tone="rose" to="/complaints" loading={statsQuery.isLoading}/>
        <KpiCard label="Resolved today" value={data?.resolvedToday ?? 0} detail={`${completionRate}% of today's workload`} icon="check" tone="emerald" to="/complaints?status=resolved" loading={statsQuery.isLoading}/>
        <KpiCard label="Avg. resolution" value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"} detail="Across resolved cases" icon="clock" tone="blue" to="/reports" loading={statsQuery.isLoading}/>
        <KpiCard label="Affected floors" value={data?.topFloors.length ?? 0} detail={data?.topFloors[0] ? `${data.topFloors[0].floor_name} needs most attention` : "All floors clear"} icon="floor" tone="violet" to="/complaints" loading={statsQuery.isLoading}/>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <section className={`${panel}`}>
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-white/10 sm:px-5"><div><div className="flex items-center gap-2"><h3 className="text-base font-black text-slate-900 dark:text-white">Attention required</h3>{urgentComplaints.length > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-600">{urgentComplaints.length} shown</span>}</div><p className="mt-1 text-[11px] text-slate-400">Highest-priority active complaints</p></div><Link to="/complaints" className="text-[11px] font-black text-indigo-600 hover:text-indigo-700">Open complaint desk</Link></header>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {urgentComplaints.map((complaint) => <Link to={`/complaints?search=${encodeURIComponent(complaint.issue_type)}`} key={complaint.id} className="group flex min-w-0 items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50 dark:hover:bg-white/[.03] sm:px-5"><span className={`h-9 w-1 shrink-0 rounded-full ${complaint.priority === "critical" ? "bg-rose-500" : complaint.priority === "high" ? "bg-orange-500" : complaint.priority === "medium" ? "bg-amber-400" : "bg-slate-300"}`}/><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-extrabold text-slate-800 dark:text-white">{complaint.issue_type}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black capitalize ring-1 ${priorityStyle[complaint.priority]}`}>{complaint.priority}</span></div><p className="mt-1 truncate text-[11px] text-slate-400">{complaint.target_name || complaint.asset_name || "Building"} · Reported by {complaint.reporter_name}</p></div><div className="shrink-0 text-right"><p className="text-[10px] font-semibold text-slate-400">{timeAgo(complaint.created_at)}</p><p className="mt-1 text-[9px] font-black capitalize text-indigo-500">{complaint.status}</p></div><span className="hidden text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 sm:block"><Icon name="arrow"/></span></Link>)}
            {!complaintsQuery.isLoading && urgentComplaints.length === 0 && <EmptyState title="No active complaints" detail="The current complaint queue is clear."/>}
            {complaintsQuery.isLoading && <div className="space-y-2 p-4"><Skeleton className="h-14"/><Skeleton className="h-14"/><Skeleton className="h-14"/></div>}
          </div>
        </section>

        <section className={`${panel} p-4 sm:p-5`}><div className="flex items-start justify-between"><div><h3 className="text-base font-black text-slate-900 dark:text-white">7-day workload</h3><p className="mt-1 text-[11px] text-slate-400">New complaints per day</p></div><Link to="/reports" className="text-[11px] font-black text-indigo-600">Full report</Link></div><div className="mt-6 flex h-44 items-end gap-2">{(data?.dailyTrends ?? []).map((item, index) => <div key={item.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-black text-slate-500 dark:text-slate-300">{item.complaint_count}</span><div className={`w-full max-w-10 rounded-t-md ${index === (data?.dailyTrends.length ?? 0) - 1 ? "bg-indigo-600" : "bg-indigo-200 dark:bg-indigo-500/30"}`} style={{ height: `${Math.max((item.complaint_count / maxTrend) * 118, 4)}px` }}/><span className="text-[9px] font-bold text-slate-400">{dayName(item.day)}</span></div>)}</div></section>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className={`${panel} p-4 sm:p-5`}><div className="flex items-start justify-between"><div><h3 className="text-base font-black text-slate-900 dark:text-white">Floor pressure</h3><p className="mt-1 text-[11px] text-slate-400">Where reported issues are concentrated</p></div><Link to="/rooms" className="text-[11px] font-black text-indigo-600">View rooms</Link></div><div className="mt-5 space-y-4">{(data?.topFloors ?? []).slice(0, 5).map((floor, index) => <div key={floor.floor_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div className="min-w-0"><div className="mb-2 flex items-center justify-between gap-2"><p className="truncate text-xs font-extrabold text-slate-700 dark:text-slate-200">{floor.floor_name}</p><span className="text-[10px] font-black text-slate-500">{floor.complaint_count} issues</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className={`h-full rounded-full ${index === 0 ? "bg-rose-500" : index === 1 ? "bg-orange-400" : "bg-indigo-400"}`} style={{ width: `${Math.max((floor.complaint_count / maxFloor) * 100, 5)}%` }}/></div></div></div>)}</div></section>

        <section className={`${panel} p-4 sm:p-5`}><h3 className="text-base font-black text-slate-900 dark:text-white">Next actions</h3><p className="mt-1 text-[11px] text-slate-400">Common administrative workflows</p><div className="mt-4 space-y-2"><ActionLink to="/complaints" icon="alert" title="Review complaint queue" detail={`${data?.openComplaints ?? 0} currently open`} tone="rose"/><ActionLink to="/announcements" icon="announce" title="Publish announcement" detail="Send an update to all users" tone="violet"/><ActionLink to="/users" icon="users" title="Manage access" detail="Review users and roles" tone="blue"/></div></section>
      </div>
    </div>
  );
}

function KpiCard({ label, value, detail, icon, tone, to, loading }: { label: string; value: string | number; detail: string; icon: "alert" | "check" | "clock" | "floor"; tone: "rose" | "emerald" | "blue" | "violet"; to: string; loading: boolean }) {
  const colors = { rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300", emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300", blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300", violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" }[tone];
  if (loading) return <Skeleton className="h-28 rounded-2xl sm:h-32"/>;
  return <Link to={to} className={`${panel} group flex min-h-28 min-w-0 items-start gap-3 p-3.5 transition hover:-translate-y-0.5 hover:border-indigo-200 sm:min-h-32 sm:p-4`}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl sm:h-11 sm:w-11 ${colors}`}><Icon name={icon}/></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:text-[11px]">{label}</span><span className="mt-1 block text-2xl font-black leading-none text-slate-950 dark:text-white sm:text-[28px]">{value}</span><span className="mt-3 block line-clamp-2 text-[10px] leading-4 text-slate-400 sm:text-[11px]">{detail}</span></span></Link>;
}

function ActionLink({ to, icon, title, detail, tone }: { to: string; icon: "alert" | "announce" | "users"; title: string; detail: string; tone: "rose" | "violet" | "blue" }) {
  const colors = { rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10", violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10", blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10" }[tone];
  return <Link to={to} className="group flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-indigo-200 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[.03]"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${colors}`}><Icon name={icon}/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-slate-800 dark:text-white">{title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-400">{detail}</span></span><span className="text-slate-300 group-hover:text-indigo-500"><Icon name="arrow"/></span></Link>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-44 place-items-center px-4 text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><Icon name="check"/></span><p className="mt-3 text-sm font-extrabold text-slate-700 dark:text-white">{title}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div></div>;
}
