import { NavLink } from "react-router-dom";

export type IconName = "dashboard" | "rooms" | "assets" | "complaints" | "users" | "announcements" | "reports" | "settings" | "bookings";

export const SECTIONS: { title: string; items: { to: string; label: string; icon: IconName; end?: boolean }[] }[] = [
  {
    title: "Command Centre",
    items: [
      { to: "/", label: "Dashboard", icon: "dashboard", end: true },
      { to: "/rooms", label: "Rooms", icon: "rooms" },
      { to: "/bookings", label: "Bookings", icon: "bookings" },
      { to: "/assets", label: "Employees", icon: "assets" },
      { to: "/complaints", label: "Complaints", icon: "complaints" },
      { to: "/users", label: "Users", icon: "users" },
    ]
  },
  {
    title: "Communication",
    items: [
      { to: "/announcements", label: "Announcements", icon: "announcements" },
    ]
  },
  {
    title: "Insights",
    items: [
      { to: "/reports", label: "Reports", icon: "reports" },
    ]
  },
  {
    title: "System",
    items: [
      { to: "/settings", label: "Settings", icon: "settings" },
    ]
  }
];

export const NAV_ITEMS: { to: string; label: string; icon: IconName; end?: boolean }[] = SECTIONS.flatMap((sec) => sec.items);

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
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">{PATHS[name]}</svg>;
}

export function Sidebar() {
  return (
    <aside className="relative z-20 hidden w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white text-slate-900 md:flex lg:w-[260px] dark:border-white/10 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-[76px] items-center justify-center border-b border-slate-200 px-4 lg:justify-start lg:px-6 dark:border-white/10">
        <div className="min-w-0 lg:pl-1">
          <p className="text-[15px] font-bold tracking-[.08em] text-slate-900 dark:text-white">FLODATA</p>
          <p className="mt-0.5 hidden text-[10px] font-semibold tracking-wider text-slate-400 lg:block">Admin Workspace</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="mb-5">
            <div className="hidden px-6 pb-2 text-[10px] font-bold uppercase tracking-[.14em] text-slate-400 lg:block">{sec.title}</div>
            <nav className="space-y-1 px-3">
              {sec.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={item.label}
                  className={({ isActive }) => `relative flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition-all duration-150 lg:justify-start ${isActive ? "bg-slate-100 text-slate-900 dark:bg-white/5 dark:text-white font-semibold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.02] dark:hover:text-white"}`}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-brand-500" />}
                      <span className={isActive ? "text-brand-500" : "text-slate-400 group-hover:text-slate-900 dark:text-slate-500 dark:group-hover:text-white"}><NavIcon name={item.icon}/></span>
                      <span className="hidden lg:block">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
