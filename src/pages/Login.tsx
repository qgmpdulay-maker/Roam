import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email.");
      setLoading(false);
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      setLoading(false);
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError) {
        setError(authError.message || "Invalid email or password.");
        return;
      }

      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false },
      });

      if (otpErr) {
        setError(otpErr.message || "Failed to send verification code.");
        await supabase.auth.signOut();
        return;
      }

      localStorage.setItem("roam_otp_required", "1");
      localStorage.setItem("roam_otp_verified", "0");
      localStorage.setItem("roam_pending_email", cleanEmail);

      nav("/login-verify", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-4xl font-bold text-orange-600">ROAM</h1>
        <p className="mb-8 text-center text-gray-500 dark:text-gray-400">
          Employee Login
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <input
            type="email"
            placeholder="Email"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="Password"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-lg font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Login"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => nav("/forgot")}
              className="text-sm text-orange-600 hover:underline dark:text-orange-500"
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={() => nav("/register")}
              className="text-sm text-gray-500 hover:underline dark:text-gray-400"
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}