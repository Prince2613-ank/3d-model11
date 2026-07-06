import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DashboardStats } from "../types/domain";
import { StatCard } from "../components/ui/StatCard";
import { Skeleton } from "../components/ui/Skeleton";

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["stats", "dashboard"],
    queryFn: () => api.get<DashboardStats>("/stats/dashboard")
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <StatCard label="Open Complaints" value={data?.openComplaints ?? 0} />
            <StatCard label="Resolved Today" value={data?.resolvedToday ?? 0} />
            <StatCard
              label="Avg. Resolution Time"
              value={data?.avgResolutionHours != null ? `${data.avgResolutionHours.toFixed(1)}h` : "—"}
            />
            <StatCard label="Top Floor Issues" value={data?.topFloors[0]?.complaint_count ?? 0} hint={data?.topFloors[0]?.floor_name} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Assets With Most Issues</h2>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : (data?.assetsWithMostIssues.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No complaints recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {data!.assetsWithMostIssues.map((a) => (
                <li key={a.asset_id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{a.asset_name}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{a.complaint_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
          <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Top Floors</h2>
          {isLoading ? (
            <Skeleton className="h-40" />
          ) : (data?.topFloors.length ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No complaints recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {data!.topFloors.map((f) => (
                <li key={f.floor_id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{f.floor_name}</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{f.complaint_count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Trends</h2>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (data?.monthlyTrends.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No complaints recorded yet.</p>
        ) : (
          <div className="flex items-end gap-2" style={{ height: 120 }}>
            {data!.monthlyTrends.map((m) => {
              const max = Math.max(...data!.monthlyTrends.map((t) => t.complaint_count), 1);
              return (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-indigo-500"
                    style={{ height: `${(m.complaint_count / max) * 100}px` }}
                    title={`${m.month}: ${m.complaint_count}`}
                  />
                  <span className="text-[10px] text-slate-400">{m.month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
