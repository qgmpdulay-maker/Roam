import React from "react";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  Navigate,
} from "react-router-dom";

import AppLayout from "@/layouts/AppLayout";
import Splash from "@/pages/Splash";
import Login from "@/pages/Login";
import Verify from "@/pages/Verify";
import Forgot from "@/pages/Forgot";
import Register from "@/pages/Register";
import AuthCallback from "@/pages/AuthCallback";
import Reset from "@/pages/Reset";
import Dashboard from "@/pages/Dashboard";
import Violations from "@/pages/Violations";
import ViolationDetail from "@/pages/ViolationDetail";
import Statistics from "@/pages/Statistics";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import Violators from "@/pages/Violators";

import { useAuth } from "@/store/auth";

// simple gate for auth-only pages
function Protected({ children }: { children: JSX.Element }) {
  const { user, initialized } = useAuth();
  if (!initialized) return null; // small splash could be used here
  return user ? children : <Navigate to="/login" replace />;
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppLayout />}>
      {/* Public */}
      <Route path="/" element={<Splash />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected */}
      <Route
        path="/dashboard"
        element={
          <Protected>
            <Dashboard />
          </Protected>
        }
      />
      <Route
        path="/violations"
        element={
          <Protected>
            <Violations />
          </Protected>
        }
      />
      <Route
        path="/violation/:id"
        element={
          <Protected>
            <ViolationDetail />
          </Protected>
        }
      />

      {/* ✅ NEW: Violators page */}
      <Route
        path="/violators"
        element={
          <Protected>
            <Violators />
          </Protected>
        }
      />

      <Route
        path="/statistics"
        element={
          <Protected>
            <Statistics />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <Settings />
          </Protected>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  )
);