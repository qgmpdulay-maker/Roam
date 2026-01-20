import { Outlet, useLocation } from "react-router-dom";
import TabBar from "@/components/TabBar";
import { useAuth } from "@/store/auth";

export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const PUBLIC_ROUTES = ["/", "/login", "/forgot", "/reset", "/verify"];
  const hideTabs =
    PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/violation/");

  return (
    // ✅ GLOBAL APP BACKGROUND
    <div className="min-h-screen bg-neutral-50 text-black dark:bg-gray-950 dark:text-gray-100">
      {/* ✅ PHONE CONTAINER: NO bg-* HERE */}
      <div className="max-w-[480px] mx-auto min-h-screen relative">
        <Outlet />
        {!hideTabs && user && <TabBar />}
      </div>
    </div>
  );
}