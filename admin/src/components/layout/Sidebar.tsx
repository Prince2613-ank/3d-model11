import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/building", label: "Building", icon: "🏢" },
  { to: "/rooms", label: "Rooms", icon: "🚪" },
  { to: "/assets", label: "Assets", icon: "🪑" },
  { to: "/complaints", label: "Complaints", icon: "🛠️" },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/announcements", label: "Announcements", icon: "📣" },
  { to: "/reports", label: "Reports", icon: "📈" },
  { to: "/settings", label: "Settings", icon: "⚙️" }
];

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white/70 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="h-8 w-8 rounded-lg bg-indigo-600" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Digital Twin Admin</span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`
            }
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
