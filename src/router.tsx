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
import Forgot from "@/pages/Forgot";
import Register from "@/pages/Register";
import Verify from "@/pages/Verify";
import SetPassword from "@/pages/SetPassword";
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

function Protected({ children }: { children: JSX.Element }) {
  const { user, initialized } = useAuth();

  if (!initialized) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Public routes */}
      <Route path="/" element={<Splash />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected routes with app layout */}
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/violations" element={<Violations />} />
        <Route path="/violation/:id" element={<ViolationDetail />} />
        <Route path="/violators" element={<Violators />} />
        <Route path="/statistics" element={<Statistics />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )
);