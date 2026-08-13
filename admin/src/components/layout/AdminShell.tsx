import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { NotificationToasts } from "./NotificationToasts";

export function AdminShell() {
  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-slate-950">
      <Sidebar />
      <NotificationToasts />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-3 pb-24 pt-5 sm:px-6 md:pb-6 lg:px-8 lg:pb-8 lg:pt-5">
          <div className="mx-auto flex min-h-full w-full min-w-0 max-w-[1540px] flex-1 flex-col"><Outlet /></div>
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
