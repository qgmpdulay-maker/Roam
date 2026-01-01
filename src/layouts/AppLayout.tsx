import { Outlet, useLocation } from "react-router-dom";
import TabBar from "@/components/TabBar";
import { useAuth } from "@/store/auth";

export default function AppLayout() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  // All routes where the bottom tabs should NOT appear
  const PUBLIC_ROUTES = ["/", "/login", "/forgot", "/reset", "/verify"];
  const hideTabs =
    PUBLIC_ROUTES.includes(pathname) || pathname.startsWith("/violation/");

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-neutral-50 relative">
      <Outlet />
      {!hideTabs && user && <TabBar />}
    </div>
  );
}
