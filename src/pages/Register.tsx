import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const darkInputClass =
  "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    const eTrim = email.trim();
    if (!eTrim) {
      setError("Please enter an email address.");
      return;
    }

    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: eTrim,
      });

      if (otpErr) {
        setError(`Could not send verification code: ${otpErr.message}`);
        console.error("signInWithOtp error:", otpErr);
        return;
      }

      setMsg("Verification code sent. Check your email.");
      nav(`/verify-register?email=${encodeURIComponent(eTrim)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Create Account</p>

        <form
          onSubmit={sendCode}
          className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3"
        >
        <input
          type="email"
          placeholder="Email"
          className={darkInputClass}
          style={{ WebkitTextFillColor: "#ffffff" }}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send verification code"}
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