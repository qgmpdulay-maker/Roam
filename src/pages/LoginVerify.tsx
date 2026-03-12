import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function LoginVerify() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const darkInputClass =
    "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

  useEffect(() => {
    const pendingEmail = localStorage.getItem("roam_pending_email") || "";
    setEmail(pendingEmail);

    if (!pendingEmail) {
      nav("/login", { replace: true });
    }
  }, [nav]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    const token = code.trim();
    const eTrim = email.trim();

    if (!eTrim) {
      setError("Missing email. Please log in again.");
      return;
    }

    if (!/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: eTrim,
        token,
        type: "email",
      });

      if (verifyError) {
        setError(`Invalid or expired code: ${verifyError.message}`);
        return;
      }

      localStorage.setItem("roam_otp_verified", "1");
      localStorage.removeItem("roam_otp_required");
      localStorage.removeItem("roam_pending_email");

      setMsg("Login verified. Redirecting…");
      setTimeout(() => nav("/dashboard", { replace: true }), 500);
    } catch (err: any) {
      console.error(err);
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setMsg("");
    setError("");

    const eTrim = email.trim();
    if (!eTrim) {
      setError("Missing email. Please log in again.");
      return;
    }

    setLoading(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: eTrim,
        options: { shouldCreateUser: false },
      });

      if (otpErr) {
        setError(`Could not resend code: ${otpErr.message}`);
        return;
      }

      setMsg("Verification code resent. Check your inbox.");
    } catch (err: any) {
      console.error(err);
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  async function backToLogin() {
    localStorage.removeItem("roam_otp_required");
    localStorage.removeItem("roam_otp_verified");
    localStorage.removeItem("roam_pending_email");
    await supabase.auth.signOut();
    nav("/login", { replace: true });
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
        <p className="text-center text-gray-400 mb-8">Login Verification</p>

        <form
          onSubmit={handleVerify}
          className="bg-gray-900 rounded-3xl border border-gray-800 p-6 space-y-4 shadow-sm"
        >
          <p className="text-sm text-gray-300 text-center">
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-white">{email}</span> to complete login.
          </p>

          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            className={darkInputClass}
            style={{ WebkitTextFillColor: "#ffffff" }}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            required
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify login"}
          </button>

          <button
            type="button"
            onClick={resendCode}
            disabled={loading}
            className="w-full rounded-2xl border border-gray-600 bg-gray-800 py-3 text-white text-lg font-semibold hover:bg-gray-700 disabled:opacity-50"
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={backToLogin}
            className="w-full rounded-2xl border border-gray-600 bg-gray-800 py-3 text-gray-200 text-base font-semibold hover:bg-gray-700"
          >
            ← Back to Login
          </button>

          {msg && <p className="text-center text-sm text-green-400">{msg}</p>}
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  );
}