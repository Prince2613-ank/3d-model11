import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { NotificationToasts } from "./NotificationToasts";

export function AdminShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f7fb] dark:bg-slate-950">
      <Sidebar />
      <NotificationToasts />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-48 -top-48 h-[480px] w-[480px] rounded-full bg-indigo-300/20 blur-3xl dark:bg-indigo-700/10" />
        <Topbar />
        <main className="relative flex-1 overflow-y-auto px-3 pb-24 pt-4 sm:px-6 md:pb-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1500px]"><Outlet /></div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
