import { NavLink } from "react-router-dom";

export type IconName = "dashboard" | "rooms" | "assets" | "complaints" | "users" | "announcements" | "reports" | "settings" | "bookings";

export const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/rooms", label: "Rooms", icon: "rooms" },
  { to: "/bookings", label: "Bookings", icon: "bookings" },
  { to: "/assets", label: "Employees", icon: "assets" },
  { to: "/complaints", label: "Complaints", icon: "complaints" },
  { to: "/users", label: "Users", icon: "users" },
  { to: "/announcements", label: "Announcements", icon: "announcements" },
  { to: "/reports", label: "Reports", icon: "reports" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  rooms: <><path d="M4 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M8 21V7h7v14M12 14h.01"/></>,
  assets: <><path d="M5 11h14l-1 10H6L5 11Z"/><path d="M8 11V7a4 4 0 0 1 8 0v4M9 15h6"/></>,
  complaints: <><path d="M14.7 6.3a4 4 0 0 0-5.6 5.6L3 18v3h3l6.1-6.1a4 4 0 0 0 5.6-5.6l-2.4 2.4-3-3 2.4-2.4Z"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  announcements: <><path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16 13 21H8l-1.5-6"/></>,
  reports: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
  bookings: <><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.37.36.7.6 1 .3.3.68.45 1.1.45h.1v4h-.1A1.7 1.7 0 0 0 19.4 15Z"/></>,
};

export function NavIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">{PATHS[name]}</svg>;
}

export function Sidebar() {
  return (
    <aside className="relative z-20 hidden w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white text-black md:flex lg:w-[278px] dark:border-white/10 dark:bg-slate-950 dark:text-white">
      <div className="flex h-[82px] items-center justify-center border-b border-slate-200 px-4 lg:justify-start lg:px-7 dark:border-white/10">
        <div className="min-w-0 text-center lg:text-left">
          <p className="truncate text-[16px] font-bold tracking-[.06em] text-black dark:text-white">FLODATA</p>
          <p className="mt-0.5 hidden text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500 lg:block dark:text-slate-500">Admin Panel</p>
        </div>
      </div>
      <div className="hidden px-7 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500 lg:block dark:text-slate-500">Command centre</div>
      <nav className="flex-1 space-y-1 px-3 py-5 lg:py-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) => `flex h-11 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors lg:justify-start ${isActive ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-md" : "text-black hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"}`}
          >
            {({ isActive }) => <><span className={isActive ? "text-white" : "text-black dark:text-slate-300"}><NavIcon name={item.icon}/></span><span className="hidden lg:block">{item.label}</span></>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
