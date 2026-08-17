import { Link } from "react-router-dom";

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: string;
  tone?: "brand" | "emerald" | "amber" | "rose";
  to?: string;
}

const TONES = {
  brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
};

export function StatCard({ label, value, hint, icon = "•", tone = "brand", to }: StatCardProps) {
  const card = (
    <div className="group relative h-full overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgba(0,0,0,0.03)] transition-all duration-200 hover:border-slate-300 dark:border-white/5 dark:bg-slate-900 dark:hover:border-white/10">
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs font-semibold text-slate-400">{hint}</p>}
        </div>
        <div className={`grid h-9 w-9 place-items-center rounded-lg text-sm font-bold ${TONES[tone]}`}>{icon}</div>
      </div>
      {to && <span className="absolute bottom-3 right-4 translate-x-1 text-sm font-bold text-slate-300 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 dark:text-slate-600">→</span>}
    </div>
  );

  return to ? <Link to={to} aria-label={`Open ${label}`} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/50">{card}</Link> : card;
}
