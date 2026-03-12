import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const darkInputClass =
    "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

  async function handleSubmit(e: React.FormEvent) {
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
      // Step 1: password login
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (authError) {
        setError(authError.message || "Invalid email or password.");
        return;
      }

      // Step 2: send login OTP
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: { shouldCreateUser: false },
      });

      if (otpErr) {
        setError(otpErr.message || "Failed to send verification code.");
        await supabase.auth.signOut();
        return;
      }

      // Mark this login as pending second-step verification
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
    <div className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
        <p className="text-center text-gray-400 mb-8">Employee Login</p>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-3xl border border-gray-800 p-6 space-y-4 shadow-sm"
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

          <input
            type="password"
            placeholder="Password"
            className={darkInputClass}
            style={{ WebkitTextFillColor: "#ffffff" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Login"}
          </button>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => nav("/forgot")}
              className="text-sm text-orange-500 hover:underline"
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={() => nav("/register")}
              className="text-sm text-gray-400 hover:underline"
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}