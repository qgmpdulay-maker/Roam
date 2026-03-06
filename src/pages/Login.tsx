import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || "Invalid email or password.");
        return;
      }

      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (otpErr) {
        setError(otpErr.message || "Failed to send verification code.");
        await supabase.auth.signOut();
        return;
      }

      localStorage.setItem("roam_otp_required", "1");
      localStorage.setItem("roam_pending_email", email);
      nav("/verify", { replace: true });
    } catch (err: any) {
      console.error(err);
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Employee Login</p>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-2xl border border-gray-700 p-5 space-y-3"
        >
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
          type="password"
          placeholder="Password"
          className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Login"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => nav("/forgot")}
              className="text-sm text-orange-600 hover:underline"
            >
              Forgot password?
            </button>

            <button
              type="button"
              onClick={() => nav("/register")}
              className="text-sm text-gray-600 hover:underline"
            >
              Create account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}