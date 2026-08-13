import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ComplaintWithAsset, DashboardStats } from "../types/domain";
import { Skeleton } from "../components/ui/Skeleton";

const panel = "min-w-0 overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,.055)] dark:border-white/10 dark:bg-slate-900";

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
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
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
  }).slice(0, 4), [activeComplaints]);
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
    <div className="flex min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500 dark:bg-brand-400" />
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-400">Live · updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <button onClick={() => void refresh()} disabled={isRefreshing} className="flex h-8 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-black transition hover:border-slate-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-white">
          <span className={isRefreshing ? "animate-spin" : ""}><Icon name="refresh"/></span>
          <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
        </button>
      </div>

      <div className="grid min-w-0 shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Open complaints" value={data?.openComplaints ?? 0} detail={activeComplaints.filter((item) => item.priority === "critical" || item.priority === "high").length ? `${activeComplaints.filter((item) => item.priority === "critical" || item.priority === "high").length} high priority` : "No urgent items"} icon="alert" to="/complaints" loading={statsQuery.isLoading}/>
        <KpiCard label="Resolved today" value={data?.resolvedToday ?? 0} detail={`${completionRate}% of today's workload`} icon="check" to="/complaints?status=resolved" loading={statsQuery.isLoading}/>
        <KpiCard label="Avg. resolution" value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"} detail="Across resolved cases" icon="clock" to="/reports" loading={statsQuery.isLoading}/>
        <KpiCard label="Affected floors" value={data?.topFloors.length ?? 0} detail={data?.topFloors[0] ? `${data.topFloors[0].floor_name} needs most attention` : "All floors clear"} icon="floor" to="/complaints" loading={statsQuery.isLoading}/>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 gap-3 xl:grid-cols-4">
        <section className={`${panel} flex min-h-0 flex-col xl:col-span-2`}>
          <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
            <div>
              <h3 className="text-sm font-black text-black dark:text-white">Attention required</h3>
              <p className="text-[10px] text-slate-400">Highest-priority active complaints</p>
            </div>
            <Link to="/complaints" className="text-[10px] font-black text-black underline underline-offset-2 dark:text-white">Open desk</Link>
          </header>
          <div className="flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-white/5">
            {urgentComplaints.map((complaint) => <Link to={`/complaints?search=${encodeURIComponent(complaint.issue_type)}`} key={complaint.id} className="group flex min-w-0 items-center gap-2.5 px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-white/[.03]"><span className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-400 to-brand-600"/><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-xs font-extrabold text-black dark:text-white">{complaint.issue_type}</p><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black capitalize ring-1 ${priorityStyle[complaint.priority]}`}>{complaint.priority}</span></div><p className="mt-0.5 truncate text-[10px] text-slate-400">{complaint.target_name || complaint.asset_name || "Building"} · {complaint.reporter_name}</p></div><span className="shrink-0 text-[9px] font-semibold text-slate-400">{timeAgo(complaint.created_at)}</span></Link>)}
            {!complaintsQuery.isLoading && urgentComplaints.length === 0 && <EmptyState title="No active complaints" detail="The current complaint queue is clear."/>}
            {complaintsQuery.isLoading && <div className="space-y-2 p-3"><Skeleton className="h-10"/><Skeleton className="h-10"/></div>}
          </div>
        </section>

        <section className={`${panel} flex min-h-0 flex-col p-3`}>
          <div className="flex shrink-0 items-start justify-between"><h3 className="text-sm font-black text-black dark:text-white">7-day workload</h3><Link to="/reports" className="text-[10px] font-black text-black underline underline-offset-2 dark:text-white">Report</Link></div>
          <div className="mt-3 flex flex-1 items-end gap-1.5">{(data?.dailyTrends ?? []).map((item, index) => <div key={item.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] font-black text-slate-500 dark:text-slate-300">{item.complaint_count}</span><div className={`w-full max-w-8 rounded-t-md ${index === (data?.dailyTrends.length ?? 0) - 1 ? "bg-gradient-to-t from-brand-600 to-brand-400" : "bg-slate-200 dark:bg-white/15"}`} style={{ height: `${Math.max((item.complaint_count / maxTrend) * 100, 4)}%` }}/><span className="text-[8px] font-bold text-slate-400">{dayName(item.day)}</span></div>)}</div>
        </section>

        <section className={`${panel} flex min-h-0 flex-col p-3`}>
          <div className="flex shrink-0 items-start justify-between"><h3 className="text-sm font-black text-black dark:text-white">Floor pressure</h3><Link to="/rooms" className="text-[10px] font-black text-black underline underline-offset-2 dark:text-white">Rooms</Link></div>
          <div className="mt-3 flex flex-1 flex-col justify-center gap-3">{(data?.topFloors ?? []).slice(0, 4).map((floor, index) => <div key={floor.floor_id} className="min-w-0"><div className="mb-1 flex items-center justify-between gap-2"><p className="truncate text-[11px] font-extrabold text-black dark:text-slate-200">{floor.floor_name}</p><span className="text-[9px] font-black text-slate-500">{floor.complaint_count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${Math.max((floor.complaint_count / maxFloor) * 100, 5)}%`, opacity: 1 - index * 0.2 }}/></div></div>)}</div>
        </section>
      </div>

      <section className={`${panel} shrink-0 p-3`}>
        <h3 className="text-sm font-black text-black dark:text-white">Next actions</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <ActionLink to="/complaints" icon="alert" title="Review complaint queue" detail={`${data?.openComplaints ?? 0} currently open`}/>
          <ActionLink to="/announcements" icon="announce" title="Publish announcement" detail="Send an update to all users"/>
          <ActionLink to="/users" icon="users" title="Manage access" detail="Review users and roles"/>
        </div>
      </section>
    </div>
  );
}

function KpiCard({ label, value, detail, icon, to, loading }: { label: string; value: string | number; detail: string; icon: "alert" | "check" | "clock" | "floor"; to: string; loading: boolean }) {
  if (loading) return <Skeleton className="h-20 rounded-[22px]"/>;
  return <Link to={to} className={`${panel} group relative flex min-w-0 items-center gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(15,23,42,.1)]`}>
    <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-brand-400 to-brand-600"/>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg"><Icon name={icon}/></span>
    <span className="min-w-0 flex-1"><span className="block text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</span><span className="block text-2xl font-black leading-tight text-black dark:text-white">{value}</span><span className="block truncate text-[11px] leading-4 text-slate-400">{detail}</span></span>
  </Link>;
}

function ActionLink({ to, icon, title, detail }: { to: string; icon: "alert" | "announce" | "users"; title: string; detail: string }) {
  return <Link to={to} className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 p-2.5 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/[.03]"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md"><Icon name={icon}/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-extrabold text-black dark:text-white">{title}</span><span className="block truncate text-[10px] text-slate-400">{detail}</span></span><span className="text-slate-300 group-hover:text-black dark:group-hover:text-white"><Icon name="arrow"/></span></Link>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-24 place-items-center px-4 text-center"><div><span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-md"><Icon name="check"/></span><p className="mt-2 text-xs font-extrabold text-black dark:text-white">{title}</p><p className="mt-0.5 text-[10px] text-slate-400">{detail}</p></div></div>;
}
