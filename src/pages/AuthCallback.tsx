import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

/**
 * Handles Supabase email links:
 *   - type=signup   (email confirmation)
 *   - type=recovery (password reset)
 *   - magic link variants with ?code=
 *
 * After exchanging the code for a session, we route:
 *   - recovery  -> /reset
 *   - signup    -> /login (or /dashboard if you prefer)
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [msg, setMsg] = useState("Finalizing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const code = params.get("code");
        const type = (params.get("type") || "").toLowerCase();

        // Newer Supabase links include a `code` param (PKCE).
        // This exchanges the one-time code for a real session.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        if (type === "recovery") {
          // Password reset flow (we already send users to /reset separately)
          nav("/reset", { replace: true });
          return;
        }

        // Default: confirmed signup / magic link → go to Login
        // (change to /dashboard if you want auto-login after confirm)
        setMsg("Email confirmed. Redirecting to login…");
        setTimeout(() => nav("/login", { replace: true }), 400);
      } catch (err: any) {
        console.error(err);
        setMsg("Link is invalid or expired. Please try again.");
        setTimeout(() => nav("/login", { replace: true }), 1200);
      }
    })();
  }, [nav, params]);

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm text-center bg-white border border-gray-200 rounded-2xl p-6">
        <h1 className="text-2xl font-semibold mb-3">Authenticating…</h1>
        <p className="text-gray-600 text-sm">{msg}</p>
      </div>
    </div>
  );
}
