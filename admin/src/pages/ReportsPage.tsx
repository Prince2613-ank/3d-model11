import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ActivityLogEntry } from "../types/domain";
import { DataTable } from "../components/ui/DataTable";
import type { Column } from "../components/ui/DataTable";

export function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity-log"],
    queryFn: () => api.get<{ entries: ActivityLogEntry[] }>("/activity-log?pageSize=200")
  });

  const columns: Column<ActivityLogEntry>[] = [
    { header: "When", render: (e) => new Date(e.created_at).toLocaleString() },
    { header: "Action", render: (e) => <span className="font-medium text-slate-800 dark:text-slate-100">{e.action.replace(/_/g, " ")}</span> },
    { header: "Entity", render: (e) => `${e.entity_type}${e.entity_id ? ` #${e.entity_id.slice(0, 8)}` : ""}` },
    { header: "Actor Role", render: (e) => e.actor_role ?? "system" },
    {
      header: "Details",
      render: (e) => (Object.keys(e.metadata ?? {}).length ? <code className="text-xs">{JSON.stringify(e.metadata)}</code> : "—")
    }
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Reports — Activity Log</h1>
      <DataTable columns={columns} rows={data?.entries ?? []} keyField={(e) => e.id} isLoading={isLoading} emptyMessage="No activity recorded yet." />
    </div>
  );
}
