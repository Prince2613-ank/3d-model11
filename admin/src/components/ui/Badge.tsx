const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  assigned: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  rejected: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
};

const PRIORITY_CLASSES: Record<string, string> = {
  low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  medium: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  critical: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
};

function Badge({ label, classes }: { label: string; classes: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge label={status} classes={STATUS_CLASSES[status] ?? STATUS_CLASSES.rejected} />;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge label={priority} classes={PRIORITY_CLASSES[priority] ?? PRIORITY_CLASSES.medium} />;
}
