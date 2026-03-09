import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Verify() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const e = params.get("email");
    if (e) setEmail(e);
  }, [params]);

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    const eTrim = email.trim();
    const token = code.trim();

    if (!eTrim) {
      setError("Missing email. Please go back and enter your email again.");
      return;
    }
    if (!/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: eTrim,
        token,
        type: "email",
      });

      if (vErr) {
        setError(`Invalid or expired code: ${vErr.message}`);
        console.error("verifyOtp error:", vErr);
        return;
      }

      // Confirm session exists before proceeding
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        setError("Verified, but session not ready. Please try again.");
        return;
      }

      setMsg("Verified! Redirecting…");
      setTimeout(() => nav("/set-password"), 400);
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setMsg("");
    setError("");

    const eTrim = email.trim();
    if (!eTrim) {
      setError("Missing email. Please go back and enter your email again.");
      return;
    }

    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({ email: eTrim });
      if (otpErr) {
        setError(`Could not resend code: ${otpErr.message}`);
        console.error("resend otp error:", otpErr);
        return;
      }
      setMsg("Code resent. Check inbox/spam.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Enter Verification Code</p>

        <form
          onSubmit={verifyCode}
          className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3"
        >
          {/* show email so they know where the code was sent */}
          <input
            type="email"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={email}
            readOnly
          />

          <input
            inputMode="numeric"
            placeholder="6-digit code"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify code"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={loading}
            className="w-full rounded-2xl border border-gray-300 text-gray-800 py-2.5 font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            Resend code
          </button>

          {/* Back to email page */}
          <button
            type="button"
            onClick={() => nav("/register")}
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
          >
            ← Back to Email
          </button>

          {msg && <p className="text-center text-sm text-green-600">{msg}</p>}
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}