import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { NotificationToasts } from "./NotificationToasts";

export function AdminShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_78%_0%,rgba(199,210,254,.45),transparent_30%),linear-gradient(135deg,#f8f9ff_0%,#f5f7fb_48%,#faf8ff_100%)] dark:bg-slate-950">
      <Sidebar />
      <NotificationToasts />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-48 -top-48 h-[480px] w-[480px] rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-700/10" />
        <Topbar />
        <main className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-24 pt-5 sm:px-6 md:pb-6 lg:px-8 lg:pb-8 lg:pt-5">
          <div className="mx-auto min-w-0 max-w-[1540px]"><Outlet /></div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
