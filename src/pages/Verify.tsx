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
  const darkInputClass =
  "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

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
      setMsg("Code resent. Check inbox or spam.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-8">Enter Verification Code</p>

        <form
          onSubmit={verifyCode}
          className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4 shadow-sm"
        >
          {email && (
            <p className="text-sm text-gray-500 text-center break-all">
              Code sent to <span className="font-medium text-gray-700">{email}</span>
            </p>
          )}

          <input
            inputMode="numeric"
            placeholder="6-digit code"
            className={darkInputClass}
            style={{ WebkitTextFillColor: "#ffffff" }}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify code"}
          </button>

          <button
            type="button"
            onClick={resend}
            disabled={loading}
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 text-gray-800 text-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={() => nav("/register")}
            className="w-full rounded-2xl border border-gray-300 bg-white py-3 text-gray-700 text-base font-semibold hover:bg-gray-50"
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