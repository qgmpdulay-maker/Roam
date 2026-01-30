import { NavLink } from "react-router-dom";
import {
  Home,
  ListChecks,
  Users,
  BarChart3,
  User,
  Settings,
} from "lucide-react";

const link = "flex flex-col items-center justify-center gap-1 text-[11px]";
const active = "text-roam-orange";
const base = "text-neutral-500";

export default function TabBar() {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white border-t border-neutral-200">
      <nav className="grid grid-cols-6 py-2">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/violations"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <ListChecks size={20} />
          <span>Violations</span>
        </NavLink>

        {/* ✅ NEW: Violators */}
        <NavLink
          to="/violators"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <Users size={20} />
          <span>Violators</span>
        </NavLink>

        <NavLink
          to="/statistics"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <BarChart3 size={20} />
          <span>Stats</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <User size={20} />
          <span>Profile</span>
        </NavLink>

        <NavLink
          to="/settings"
          className={({ isActive }) => `${link} ${isActive ? active : base}`}
        >
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
