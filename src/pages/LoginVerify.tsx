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

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  const secondaryButtonClass =
    "w-full rounded-2xl border border-gray-300 bg-white py-3 text-base font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700";

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
    } catch (err) {
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
    } catch (err) {
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
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-4xl font-bold text-orange-600">ROAM</h1>
        <p className="mb-8 text-center text-gray-500 dark:text-gray-400">
          Login Verification
        </p>

        <form
          onSubmit={handleVerify}
          className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <p className="text-center text-sm text-gray-600 dark:text-gray-300">
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-gray-900 dark:text-white">{email}</span> to
            complete login.
          </p>

          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            required
            autoComplete="one-time-code"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-lg font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify login"}
          </button>

          <button
            type="button"
            onClick={resendCode}
            disabled={loading}
            className={secondaryButtonClass}
          >
            Resend code
          </button>

          <button
            type="button"
            onClick={backToLogin}
            className={secondaryButtonClass}
          >
            ← Back to Login
          </button>

          {msg && <p className="text-center text-sm text-green-600">{msg}</p>}
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  );
}