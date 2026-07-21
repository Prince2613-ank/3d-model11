import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS, NavIcon } from "./Sidebar";
import { useAuth } from "../../contexts/AuthContext";

const PRIMARY_PATHS = ["/", "/complaints", "/announcements", "/assets"];

export function MobileNav() {
  const { signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const primary = NAV_ITEMS.filter((item) => PRIMARY_PATHS.includes(item.to));
  const secondary = NAV_ITEMS.filter((item) => !PRIMARY_PATHS.includes(item.to));

  useEffect(() => setMoreOpen(false), [pathname]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-[55] md:hidden">
          <button className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-label="Close navigation" />
          <section className="absolute inset-x-2 bottom-[76px] rounded-[24px] border border-white/70 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,.28)] dark:border-white/10 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-black text-slate-900 dark:text-white">More tools</p><p className="text-[11px] text-slate-400">Manage your workspace</p></div><button onClick={() => setMoreOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/5">✕</button></div>
            <div className="grid grid-cols-3 gap-2">
              {secondary.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl px-2 text-center text-[11px] font-bold transition ${isActive ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}><NavIcon name={item.icon}/><span>{item.label}</span></NavLink>)}
            </div>
            <button onClick={() => void signOut()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-50 text-xs font-black text-rose-600 dark:bg-rose-500/10 dark:text-rose-300"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg> Sign out</button>
          </section>
        </div>
      )}

      <nav className="fixed inset-x-2 bottom-2 z-50 grid h-[66px] grid-cols-5 rounded-[22px] border border-white/70 bg-slate-950/95 px-1.5 shadow-[0_18px_50px_rgba(15,23,42,.35)] backdrop-blur-xl md:hidden">
        {primary.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-bold transition ${isActive ? "text-white" : "text-slate-500"}`}>{({ isActive }) => <><span className={`grid h-8 w-8 place-items-center rounded-xl ${isActive ? "bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-lg shadow-indigo-500/30" : ""}`}><NavIcon name={item.icon}/></span><span>{item.label === "Announcements" ? "Alerts" : item.label}</span></>}</NavLink>)}
        <button onClick={() => setMoreOpen((open) => !open)} className={`flex flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-bold ${moreOpen ? "text-white" : "text-slate-500"}`}><span className={`grid h-8 w-8 place-items-center rounded-xl ${moreOpen ? "bg-gradient-to-br from-indigo-500 to-cyan-400" : ""}`}><svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></span><span>More</span></button>
      </nav>
    </>
  );
}
