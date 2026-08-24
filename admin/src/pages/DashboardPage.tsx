import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { ComplaintWithAsset, DashboardStats } from "../types/domain";
import { Skeleton } from "../components/ui/Skeleton";


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
    <div className="flex flex-col gap-6">
      {/* Overview header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Overview</h2>
          <p className="text-xs text-slate-500 mt-1">Live • Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 text-xs dark:border-white/10 dark:bg-slate-900">
            <button className="rounded px-2.5 py-1 font-semibold text-slate-700 bg-slate-100 dark:text-slate-200 dark:bg-white/5">7 Days</button>
            <button className="rounded px-2.5 py-1 font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">30 Days</button>
          </div>
          <button onClick={() => void refresh()} disabled={isRefreshing} className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-white/5">
            <span className={isRefreshing ? "animate-spin" : ""}><Icon name="refresh"/></span>
            <span>{isRefreshing ? "Refreshing" : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Open complaints" value={data?.openComplaints ?? 0} icon="alert" to="/complaints" loading={statsQuery.isLoading}/>
        <KpiCard label="Resolved today" value={data?.resolvedToday ?? 0} detail={totalToday ? `${completionRate}% of today's workload` : undefined} icon="check" to="/complaints?status=resolved" loading={statsQuery.isLoading}/>
        <KpiCard label="Avg. resolution" value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"} detail={data?.avgResolutionHours != null ? "Across resolved cases" : undefined} icon="clock" to="/reports" loading={statsQuery.isLoading}/>
        <KpiCard label="Affected floors" value={data?.topFloors.length ?? 0} detail={data?.topFloors[0] ? `${data.topFloors[0].floor_name} needs attention` : "All floors clear"} icon="floor" to="/complaints" loading={statsQuery.isLoading}/>
      </div>

      {/* Middle section: Chart + Floor pressure */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Complaints trend</h3>
              <p className="text-[11px] text-slate-400">Total reported issues over the last 7 days</p>
            </div>
            <Link to="/reports" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">View analytics</Link>
          </div>
          <div className="mt-5 flex h-48 items-end gap-3 pt-6">
            {(data?.dailyTrends ?? []).map((item) => (
              <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-bold text-slate-500">{item.complaint_count}</span>
                <div 
                  className={`w-full rounded-t bg-brand-500 hover:bg-brand-600 transition-all duration-200`} 
                  style={{ height: `${Math.max((item.complaint_count / maxTrend) * 80, 5)}%` }}
                />
                <span className="text-[10px] font-semibold text-slate-400">{dayName(item.day)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Floor Utilization / Pressure */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Floor pressure</h3>
              <p className="text-[11px] text-slate-400">Active complaints grouped by building floor</p>
            </div>
            <Link to="/rooms" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Manage floors</Link>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            {(data?.topFloors ?? []).slice(0, 4).map((floor) => (
              <div key={floor.floor_id} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{floor.floor_name}</p>
                  <span className="text-[10px] font-bold text-slate-500">{floor.complaint_count} open</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div 
                    className="h-full rounded-full bg-brand-500" 
                    style={{ width: `${Math.max((floor.complaint_count / maxFloor) * 100, 5)}%` }}
                  />
                </div>
              </div>
            ))}
            {!data?.topFloors.length && <p className="text-xs text-slate-400 text-center py-6">All floors currently clear.</p>}
          </div>
        </div>
      </div>

      {/* Bottom section: Priority Table + Recent Activity timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Table */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-white/5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Priority complaints</h3>
              <p className="text-[11px] text-slate-400">High-priority unresolved work order items</p>
            </div>
            <Link to="/complaints" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">View desk</Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase tracking-wider font-semibold dark:border-white/5">
                  <th className="py-2.5 font-medium">Issue</th>
                  <th className="py-2.5 font-medium">Location</th>
                  <th className="py-2.5 font-medium">Priority</th>
                  <th className="py-2.5 font-medium">Reporter</th>
                  <th className="py-2.5 font-medium text-right">Age</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {urgentComplaints.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                    <td className="py-3 font-semibold text-slate-800 dark:text-slate-100">{c.issue_type}</td>
                    <td className="py-3 text-slate-500">{c.target_name || c.asset_name || "Building"}</td>
                    <td className="py-3">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold capitalize border ${priorityStyle[c.priority]}`}>
                        {c.priority}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{c.reporter_name}</td>
                    <td className="py-3 text-right text-slate-400">{timeAgo(c.created_at)}</td>
                  </tr>
                ))}
                {!complaintsQuery.isLoading && urgentComplaints.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">No active complaints require immediate attention.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900">
          <div className="border-b border-slate-100 pb-3 dark:border-white/5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent activity</h3>
            <p className="text-[11px] text-slate-400">Timeline of updates across the building</p>
          </div>
          <div className="mt-5 space-y-4">
            {complaints.slice(0, 4).map((c) => (
              <div key={c.id} className="flex gap-3 text-xs">
                <div className="flex flex-col items-center">
                  <div className="h-2 w-2 rounded-full bg-brand-500 mt-1.5" />
                  <div className="w-0.5 flex-1 bg-slate-100 dark:bg-white/5 mt-1" />
                </div>
                <div className="flex-1 pb-1">
                  <div className="flex justify-between gap-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      {c.status === "resolved" ? "Complaint resolved" : "New issue reported"}
                    </p>
                    <span className="text-[10px] text-slate-400">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{c.issue_type} in {c.target_name || c.asset_name || "Common Area"}</p>
                </div>
              </div>
            ))}
            {!complaints.length && <p className="text-xs text-slate-400 text-center py-6">No recent activity recorded.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, detail, icon, to, loading }: { label: string; value: string | number; detail?: string; icon: "alert" | "check" | "clock" | "floor"; to: string; loading: boolean }) {
  if (loading) return <Skeleton className="h-24 rounded-xl"/>;

  return (
    <Link to={to} className="group relative flex flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:border-slate-300 dark:border-white/5 dark:bg-slate-900 dark:hover:border-white/10 transition-all duration-150">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="text-slate-300 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors"><Icon name={icon}/></span>
      </div>
      <div className="mt-2.5">
        <h4 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</h4>
        {detail && <p className="mt-1 text-[10px] text-slate-400 truncate">{detail}</p>}
      </div>
    </Link>
  );
}
