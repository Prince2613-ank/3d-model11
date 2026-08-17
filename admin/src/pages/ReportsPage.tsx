import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ActivityLogEntry } from "../types/domain";
import { Skeleton } from "../components/ui/Skeleton";

type Period = "today" | "7days" | "30days" | "all";
type IconName = "login" | "change" | "people" | "clock" | "search" | "filter" | "chevron";


export function ReportsPage() {
  const [period, setPeriod] = useState<Period>("7days");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["activity-log"],
    queryFn: () => api.get<{ entries: ActivityLogEntry[] }>("/activity-log?pageSize=500")
  });

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const periodEntries = useMemo(() => entries.filter((entry) => inPeriod(entry.created_at, period)), [entries, period]);
  const filtered = useMemo(() => periodEntries.filter((entry) => {
    const haystack = `${entry.actor_name ?? ""} ${entry.actor_email ?? ""} ${entry.action} ${entry.entity_type} ${entry.affected_name ?? ""}`.toLowerCase();
    return (actionFilter === "all" || actionGroup(entry.action) === actionFilter) && haystack.includes(search.trim().toLowerCase());
  }), [periodEntries, actionFilter, search]);

  const insights = useMemo(() => {
    const logins = periodEntries.filter((entry) => entry.action === "user_login");
    const people = new Set(logins.map((entry) => entry.actor_id ?? entry.actor_email).filter(Boolean));
    const changes = periodEntries.filter((entry) => entry.action !== "user_login");
    const affected = new Set(changes.map((entry) => `${entry.entity_type}:${entry.entity_id}`).filter((value) => !value.endsWith(":null")));
    const byActor = new Map<string, { name: string; email: string; count: number; last: string }>();
    logins.forEach((entry) => {
      const key = entry.actor_id ?? entry.actor_email ?? "system";
      const current = byActor.get(key);
      byActor.set(key, {
        name: entry.actor_name || entry.actor_email?.split("@")[0] || "Unknown user",
        email: entry.actor_email || "No email recorded",
        count: (current?.count ?? 0) + 1,
        last: !current || new Date(entry.created_at) > new Date(current.last) ? entry.created_at : current.last
      });
    });
    return { logins: logins.length, people: people.size, changes: changes.length, affected: affected.size, actors: [...byActor.values()].sort((a, b) => b.count - a.count) };
  }, [periodEntries]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 pb-5 dark:border-white/10">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Reports & Insights</h2>
          <p className="text-xs text-slate-500 mt-1">Audit log records of user sessions, seat assignments, and room configurations.</p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total sign-ins" value={insights.logins} note={`${insights.people} unique ${insights.people === 1 ? "person" : "people"}`} icon="login" loading={isLoading} />
        <Metric label="People active" value={insights.people} note="Verified identities" icon="people" loading={isLoading} />
        <Metric label="Actions performed" value={insights.changes} note="Excludes sign-ins" icon="change" loading={isLoading} />
        <Metric label="Records affected" value={insights.affected} note="Unique workspace items" icon="clock" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-slate-900">
          <div className="mb-4"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Sign-in frequency</h2><p className="text-[11px] text-slate-400">Total session check-ins by employee</p></div>
          {isLoading ? <Skeleton className="h-64 rounded-xl" /> : insights.actors.length === 0 ? <Empty label="No sign-ins in this period" /> : <div className="space-y-3">{insights.actors.slice(0, 8).map((actor, index) => {
            const max = insights.actors[0]?.count || 1;
            return <div key={actor.email} className="rounded-xl bg-slate-50 p-3.5 dark:bg-white/[.02]"><div className="flex items-center gap-3"><Avatar name={actor.name} index={index} /><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{actor.name}</p><span className="shrink-0 rounded bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{actor.count}×</span></div><p className="truncate text-[10px] text-slate-400">{actor.email}</p></div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/5"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max((actor.count / max) * 100, 8)}%` }} /></div><p className="mt-2 text-[10px] font-semibold text-slate-400">Last seen {formatRelative(actor.last)}</p></div>;
          })}</div>}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-100 p-5 dark:border-white/5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-slate-900 dark:text-white">Activity timeline</h2><p className="text-[11px] text-slate-400">Audit logs of all administrative modifications</p></div><span className="text-[10px] font-bold text-slate-400">Showing {filtered.length} of {periodEntries.length}</span></div>
            <div className="mt-4 flex flex-col sm:flex-row gap-2"><label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-white/10 dark:bg-white/[.02]"><Icon name="search" className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person, action or affected item…" className="min-w-0 flex-1 bg-transparent py-2 text-xs text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100" /></label><label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 dark:border-white/10 dark:bg-white/[.02]"><Icon name="filter" className="h-4 w-4 text-slate-400" /><select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="min-w-0 bg-transparent py-2 text-xs font-semibold text-slate-600 outline-none dark:text-slate-200"><option value="all">All activity</option><option value="login">Sign-ins</option><option value="create">Created</option><option value="update">Changed</option><option value="delete">Deleted</option></select></label></div>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-xl" />)}</div> : filtered.length === 0 ? <div className="p-5"><Empty label="No activity matches these filters" /></div> : filtered.map((entry) => <ActivityRow key={entry.id} entry={entry} open={expanded === entry.id} onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)} />)}
          </div>
        </section>
      </div>
    </div>
  );
}

function PeriodPicker({ value, onChange }: { value: Period; onChange: (period: Period) => void }) {
  const options: { value: Period; label: string }[] = [{ value: "today", label: "Today" }, { value: "7days", label: "7 days" }, { value: "30days", label: "30 days" }, { value: "all", label: "All time" }];
  return <div className="flex rounded-lg border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-slate-900">{options.map((option) => <button key={option.value} onClick={() => onChange(option.value)} className={`rounded px-3 py-1.5 text-xs font-semibold transition ${value === option.value ? "bg-slate-100 text-slate-900 dark:bg-white/5 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}>{option.label}</button>)}</div>;
}

function Metric({ label, value, note, icon, loading }: { label: string; value: number; note: string; icon: IconName; loading: boolean }) {
  const iconTones = {
    login: "bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300",
    people: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    change: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    clock: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300",
    search: "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300",
    filter: "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300",
    chevron: "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300",
  };

  return (
    <article className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconTones[icon] || "bg-slate-50 text-slate-600"}`}><Icon name={icon} className="h-4 w-4" /></span>
      </div>
      <div className="mt-2.5">
        {loading ? <Skeleton className="h-8 w-16" /> : <h4 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value.toLocaleString()}</h4>}
        <p className="text-[10px] text-slate-400 mt-1">{note}</p>
      </div>
    </article>
  );
}

function ActivityRow({ entry, open, onToggle }: { entry: ActivityLogEntry; open: boolean; onToggle: () => void }) {
  const group = actionGroup(entry.action);
  const colors: Record<string, string> = { login: "bg-brand-500", create: "bg-emerald-500", update: "bg-blue-500", delete: "bg-rose-500" };
  const actor = entry.actor_name || entry.actor_email?.split("@")[0] || (entry.actor_role === null ? "System" : "Unknown user");
  const affected = entry.affected_name || `${friendly(entry.entity_type)}${entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}` : ""}`;
  const metadata = Object.entries(entry.metadata ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return <article className="border-b border-slate-100 last:border-0 dark:border-white/5"><button onClick={onToggle} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-white/[.025]"><span className={`h-2.5 w-2.5 rounded-full ${colors[group]} ring-4 ring-slate-100 dark:ring-white/5`} /><div className="min-w-0"><p className="truncate text-sm font-bold text-black dark:text-slate-100"><span className="font-black">{actor}</span> {actionSentence(entry.action)}</p><p className="mt-1 truncate text-[11px] text-slate-400">Affected: <span className="font-bold text-slate-500 dark:text-slate-300">{affected}</span> · {formatExact(entry.created_at)}</p></div><Icon name="chevron" className={`h-4 w-4 text-slate-400 transition ${open ? "rotate-180" : ""}`} /></button>{open && <div className="mx-5 mb-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/[.025]"><div className="grid gap-3 text-xs sm:grid-cols-2"><Detail label="Performed by" value={`${actor}${entry.actor_email ? ` (${entry.actor_email})` : ""}`} /><Detail label="Role" value={entry.actor_role || "System"} /><Detail label="Affected record" value={affected} /><Detail label="Date & time" value={formatExact(entry.created_at)} /></div>{metadata.length > 0 && <div className="mt-4 border-t border-slate-200/70 pt-3 dark:border-white/5"><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">What changed</p><div className="flex flex-wrap gap-2">{metadata.map(([key, value]) => <span key={key} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"><b className="capitalize">{friendly(key)}:</b> {displayValue(value)}</span>)}</div></div>}</div>}</article>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 break-words font-bold capitalize text-black dark:text-slate-200">{value}</p></div>; }
function Avatar({ name }: { name: string; index: number }) { return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-black text-white shadow-md">{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>; }
function Empty({ label }: { label: string }) { return <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-200 text-sm font-semibold text-slate-400 dark:border-white/10">{label}</div>; }

function inPeriod(date: string, period: Period) { if (period === "all") return true; const now = new Date(); const then = new Date(date); if (period === "today") return then.toDateString() === now.toDateString(); const days = period === "7days" ? 7 : 30; return now.getTime() - then.getTime() <= days * 86_400_000; }
function actionGroup(action: string) { if (action === "user_login") return "login"; if (/(created|activated)$/.test(action)) return "create"; if (/(deleted|deactivated|rejected)$/.test(action)) return "delete"; return "update"; }
function actionSentence(action: string) { const labels: Record<string, string> = { user_login: "signed in", user_role_changed: "changed a user role", user_activated: "activated a user", user_deactivated: "deactivated a user", asset_created: "created an employee record", asset_updated: "updated an employee record", asset_moved: "moved an employee seat", asset_deleted: "deleted an employee record", complaint_created: "raised a complaint", complaint_updated: "updated a complaint", complaint_resolved: "resolved a complaint", complaint_rejected: "rejected a complaint", announcement_created: "published an announcement", announcement_updated: "updated an announcement", announcement_deleted: "deleted an announcement" }; return labels[action] || action.replace(/_/g, " "); }
function friendly(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function displayValue(value: unknown) { if (typeof value === "boolean") return value ? "Yes" : "No"; if (typeof value === "object") return JSON.stringify(value); return String(value); }
function formatExact(date: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(date)); }
function formatRelative(date: string) { const delta = Date.now() - new Date(date).getTime(); const minutes = Math.max(0, Math.floor(delta / 60_000)); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return `${days}d ago`; }

function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    login: <><path d="M10 17l5-5-5-5" /><path d="M15 12H3M14 3h5a2 2 0 012 2v14a2 2 0 01-2 2h-5" /></>,
    change: <><path d="M4 7h11M4 7l3-3M4 7l3 3M20 17H9M20 17l-3-3M20 17l-3 3" /></>,
    people: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
    filter: <path d="M4 5h16l-6 7v5l-4 2v-7z" />,
    chevron: <path d="M6 9l6 6 6-6" />
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}
