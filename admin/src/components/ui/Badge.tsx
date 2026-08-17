const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200/40 dark:border-amber-500/20",
  assigned: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200/40 dark:border-blue-500/20",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200/40 dark:border-emerald-500/20",
  rejected: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border border-rose-200/40 dark:border-rose-500/20",
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200/40 dark:border-emerald-500/20"
};

const PRIORITY_CLASSES: Record<string, string> = {
  low: "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300 border border-slate-200/40 dark:border-white/10",
  medium: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200/40 dark:border-blue-500/20",
  high: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300 border border-orange-200/40 dark:border-orange-500/20",
  critical: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300 border border-rose-200/40 dark:border-rose-500/20"
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
