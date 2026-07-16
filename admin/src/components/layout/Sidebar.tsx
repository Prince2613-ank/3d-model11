import { NavLink } from "react-router-dom";

export type IconName = "dashboard" | "building" | "rooms" | "assets" | "complaints" | "users" | "announcements" | "reports" | "settings";

export const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/building", label: "Building", icon: "building" },
  { to: "/rooms", label: "Rooms", icon: "rooms" },
  { to: "/assets", label: "Employees", icon: "assets" },
  { to: "/complaints", label: "Complaints", icon: "complaints" },
  { to: "/users", label: "Users", icon: "users" },
  { to: "/announcements", label: "Announcements", icon: "announcements" },
  { to: "/reports", label: "Reports", icon: "reports" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h8v18"/><path d="M14 9h4a2 2 0 0 1 2 2v10M8 7h2M8 11h2M8 15h2M7 21h14"/></>,
  rooms: <><path d="M4 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M8 21V7h7v14M12 14h.01"/></>,
  assets: <><path d="M5 11h14l-1 10H6L5 11Z"/><path d="M8 11V7a4 4 0 0 1 8 0v4M9 15h6"/></>,
  complaints: <><path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4 4 0 0 0 5.6-5.6l-2.4 2.4-3-3 2.4-2.4Z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  announcements: <><path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16 13 21H8l-1.5-6"/></>,
  reports: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.37.36.7.6 1 .3.3.68.45 1.1.45h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></>,
};

export function NavIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">{PATHS[name]}</svg>;
}

export function Sidebar() {
  return (
    <aside className="relative z-20 hidden w-[76px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-slate-950 text-white shadow-2xl shadow-slate-950/20 md:flex lg:w-[264px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(99,102,241,.32),transparent_35%),radial-gradient(circle_at_100%_80%,rgba(14,165,233,.16),transparent_35%)]" />
      <div className="relative flex h-[82px] items-center justify-center gap-3 border-b border-white/10 px-4 lg:justify-start lg:px-6">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V9l8-5 8 5v9l-8 3-8-3Z"/><path d="m4 9 8 4 8-4M12 13v8"/></svg>
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-[15px] font-bold tracking-tight">Digital Twin</p>
          <p className="text-[11px] font-medium uppercase tracking-[.2em] text-cyan-300/80">Control Center</p>
        </div>
      </div>
      <div className="relative hidden px-6 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[.2em] text-slate-500 lg:block">Workspace</div>
      <nav className="relative flex-1 space-y-1.5 px-3 py-5 lg:py-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) => `group relative flex h-11 items-center justify-center gap-3 overflow-hidden rounded-xl px-3 text-sm font-semibold transition-all duration-200 lg:justify-start ${isActive ? "bg-white text-slate-950 shadow-lg shadow-black/20" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}
          >
            {({ isActive }) => <><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors ${isActive ? "bg-indigo-50 text-indigo-600" : "text-slate-400 group-hover:text-cyan-300"}`}><NavIcon name={item.icon}/></span><span className="hidden lg:block">{item.label}</span>{isActive && <span className="absolute right-2 hidden h-1.5 w-1.5 rounded-full bg-indigo-500 lg:block"/>}</>}
          </NavLink>
        ))}
      </nav>
      <div className="relative m-3 hidden rounded-2xl border border-white/10 bg-white/5 p-4 lg:block">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/> System online</div>
        <p className="text-[11px] leading-5 text-slate-500">Live operations and digital-twin services are connected.</p>
      </div>
    </aside>
  );
}
