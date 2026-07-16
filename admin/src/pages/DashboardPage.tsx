import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { DashboardStats } from "../types/domain";
import { StatCard } from "../components/ui/StatCard";
import { Skeleton } from "../components/ui/Skeleton";
import { useAuth } from "../contexts/AuthContext";

const cardLink = "group rounded-[24px] focus:outline-none focus:ring-2 focus:ring-indigo-500/50";
const panel = "h-full rounded-[24px] border border-white/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.06)] transition group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_40px_rgba(15,23,42,.1)] dark:border-white/10 dark:bg-slate-900";

export function DashboardPage() {
  const { profile } = useAuth();
  const { data, isLoading } = useQuery({ queryKey: ["stats", "dashboard"], queryFn: () => api.get<DashboardStats>("/stats/dashboard") });
  const maxTrend = Math.max(...(data?.monthlyTrends.map((item) => item.complaint_count) ?? [1]), 1);
  const maxAsset = Math.max(...(data?.assetsWithMostIssues.map((item) => item.complaint_count) ?? [1]), 1);

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 px-6 py-7 text-white shadow-[0_20px_60px_rgba(49,46,129,.25)] sm:px-8">
        <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full border-[45px] border-white/5" /><div className="absolute bottom-0 right-1/3 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Live intelligence</div><h2 className="text-2xl font-black tracking-tight sm:text-3xl">Good afternoon, {(profile?.display_name || "Admin").split(" ")[0]}.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100/70">Monitor your building, resolve issues faster, and keep every occupant informed from one workspace.</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-indigo-200">Today</p><p className="mt-1 text-sm font-bold">{new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "2-digit", month: "short" }).format(new Date())}</p></div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-[22px]" />) : <>
          <StatCard label="Open complaints" value={data?.openComplaints ?? 0} hint="Needs attention" icon="!" tone="rose" to="/complaints" />
          <StatCard label="Resolved today" value={data?.resolvedToday ?? 0} hint="Completed today" icon="✓" tone="emerald" to="/complaints?status=resolved" />
          <StatCard label="Avg. resolution" value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"} hint="Response efficiency" icon="↗" tone="indigo" to="/reports" />
          <StatCard label="Top floor issues" value={data?.topFloors[0]?.complaint_count ?? 0} hint={data?.topFloors[0]?.floor_name ?? "No floor data"} icon="⌁" tone="amber" to="/building" />
        </>}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <Link to="/reports" aria-label="Open complaint reports" className={cardLink}>
          <section className={panel}>
            <div className="mb-6 flex items-center justify-between"><div><h3 className="text-base font-extrabold text-slate-900 dark:text-white">Issue trend</h3><p className="mt-1 text-xs text-slate-400">Complaints created by month</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">Last 12 months · View reports →</span></div>
            {isLoading ? <Skeleton className="h-52" /> : (data?.monthlyTrends.length ?? 0) === 0 ? <EmptyState label="No complaint trends yet" /> : <div className="flex h-52 items-end gap-2 rounded-2xl bg-gradient-to-b from-slate-50 to-white px-4 pb-3 pt-6 dark:from-white/5 dark:to-transparent">{data!.monthlyTrends.map((item) => <div key={item.month} className="group/bar flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-bold text-slate-400 opacity-0 transition group-hover/bar:opacity-100">{item.complaint_count}</span><div className="w-full max-w-14 rounded-t-lg bg-gradient-to-t from-indigo-600 to-cyan-400 shadow-md shadow-indigo-500/10 transition-all duration-300 group-hover/bar:brightness-110" style={{ height: `${Math.max((item.complaint_count / maxTrend) * 150, 5)}px` }} title={`${item.month}: ${item.complaint_count}`} /><span className="text-[10px] font-semibold text-slate-400">{item.month.slice(5)}</span></div>)}</div>}
          </section>
        </Link>

        <Link to="/assets" aria-label="Open employee workspace" className={cardLink}>
          <section className={panel}>
            <div className="mb-6"><h3 className="text-base font-extrabold text-slate-900 dark:text-white">Employees needing attention</h3><p className="mt-1 text-xs text-slate-400">Most frequently reported items · Open employees →</p></div>
            {isLoading ? <Skeleton className="h-52" /> : (data?.assetsWithMostIssues.length ?? 0) === 0 ? <EmptyState label="No employee issues recorded" /> : <div className="space-y-5">{data!.assetsWithMostIssues.slice(0, 5).map((item, index) => <div key={item.asset_id}><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-500 dark:bg-white/5">{index + 1}</span><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.asset_name}</span></div><span className="text-xs font-black text-slate-900 dark:text-white">{item.complaint_count}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-orange-400" style={{ width: `${(item.complaint_count / maxAsset) * 100}%` }} /></div></div>)}</div>}
          </section>
        </Link>
      </div>

      <section className="rounded-[24px] border border-white/80 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.06)] dark:border-white/10 dark:bg-slate-900">
        <div className="mb-5"><h3 className="text-base font-extrabold text-slate-900 dark:text-white">Floor health</h3><p className="mt-1 text-xs text-slate-400">Issue distribution across the building</p></div>
        {isLoading ? <Skeleton className="h-24" /> : (data?.topFloors.length ?? 0) === 0 ? <EmptyState label="No floor issues recorded" /> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data!.topFloors.map((floor) => <Link to="/building" key={floor.floor_id} className="group flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/5 dark:bg-white/[.03] dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10"><div><p className="text-sm font-extrabold text-slate-800 dark:text-white">{floor.floor_name}</p><p className="mt-1 text-[11px] text-slate-400">Reported issues · Open floor →</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-sm font-black text-amber-700 transition group-hover:scale-105 dark:bg-amber-500/15 dark:text-amber-300">{floor.complaint_count}</span></Link>)}</div>}
      </section>
    </div>
  );
}

function EmptyState({ label }: { label: string }) { return <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm font-semibold text-slate-400 dark:border-white/10">{label}</div>; }
