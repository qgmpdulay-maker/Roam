import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const redirectTo = `${window.location.origin}/verify`;

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    if (!email.trim()) {
      setError("Please enter an email address.");
      return;
    }
    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password: pw,
        options: { emailRedirectTo: redirectTo },
      });

      if (signErr) {
        const m = signErr.message?.toLowerCase() || "";

        if (m.includes("already registered")) {
          setError(
            "This email is already registered. Tap “Resend confirmation email” then confirm from your inbox."
          );
        } else if (m.includes("redirect")) {
          setError(
            "Redirect URL is not allowed. Add /verify to Auth → URL Configuration → Redirect URLs in Supabase."
          );
        } else if (m.includes("password")) {
          setError(signErr.message);
        } else if (m.includes("smtp") || m.includes("email")) {
          setError(
            `Email sending failed: ${signErr.message}. If you use custom SMTP, check Auth → SMTP settings.`
          );
        } else {
          setError(`Sign up failed: ${signErr.message}`);
        }
        console.error("signUp error:", signErr);
        return;
      }

      // Some projects disable email confirmations; account may be active immediately.
      if (data?.user?.identities && data.user.identities.length > 0) {
        setMsg("We sent a confirmation link to your email. Please confirm, then log in.");
      } else {
        setMsg("Check your inbox for the confirmation link.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setMsg("");
    setError("");

    if (!email.trim()) {
      setError("Enter your email above first, then tap Resend.");
      return;
    }

    try {
      const { error: rErr } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });
      if (rErr) {
        setError(`Could not resend: ${rErr.message}`);
        console.error("resend error:", rErr);
        return;
      }
      setMsg("Confirmation email resent. Check your inbox and spam folder.");
    } catch (e: any) {
      setError(e?.message || "Could not resend confirmation email.");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Create Account</p>

        <form onSubmit={handleRegister} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Password (min 8 chars)"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoComplete="new-password"
          />

          <input
            type="password"
            placeholder="Confirm password"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create account"}
          </button>

          <button
            type="button"
            onClick={resend}
            className="w-full rounded-2xl border border-gray-300 text-gray-800 py-2.5 font-semibold hover:bg-gray-50"
          >
            Resend confirmation email
          </button>

          {msg && <p className="text-center text-sm text-green-600">{msg}</p>}
          {error && <p className="text-center text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => nav("/login")}
              className="text-sm text-gray-600 hover:underline"
            >
              ← Back to Login
            </button>

            <button
              type="button"
              onClick={() => nav("/forgot")}
              className="text-sm text-orange-600 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}