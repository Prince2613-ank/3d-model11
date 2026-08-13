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
  brand: "from-brand-500 to-brand-600 shadow-brand-500/20",
  emerald: "from-emerald-400 to-teal-600 shadow-emerald-500/20",
  amber: "from-amber-400 to-orange-500 shadow-amber-500/20",
  rose: "from-rose-400 to-pink-600 shadow-rose-500/20",
};

export function StatCard({ label, value, hint, icon = "•", tone = "brand", to }: StatCardProps) {
  const card = (
    <div className="group relative h-full overflow-hidden rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,.11)] dark:border-white/10 dark:bg-slate-900">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-slate-100/80 transition-transform duration-500 group-hover:scale-125 dark:bg-white/5" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[.12em] text-slate-400">{label}</p>
          <p className="mt-3 text-[32px] font-black tracking-tight text-slate-900 dark:text-white">{value}</p>
          {hint && <p className="mt-1 text-xs font-medium text-slate-400">{hint}</p>}
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br text-lg text-white shadow-lg ${TONES[tone]}`}>{icon}</div>
      </div>
      <div className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${TONES[tone].split(" shadow")[0]}`} />
      {to && <span className="absolute bottom-4 right-5 translate-x-2 text-sm font-black text-slate-300 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100 dark:text-slate-600">→</span>}
    </div>
  );

  return to ? <Link to={to} aria-label={`Open ${label}`} className="block rounded-[22px] focus:outline-none focus:ring-2 focus:ring-brand-500/50">{card}</Link> : card;
}
