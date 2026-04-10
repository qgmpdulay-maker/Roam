import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Register() {
  const nav = useNavigate();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const darkInputClass =
    "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");
    setMsg("");

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setError("Please enter your email.");
      setLoading(false);
      return;
    }

    try {
      // Send OTP (6-digit code)
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (otpErr) {
        console.error("OTP error:", otpErr);

        // Handle common Supabase errors
        if (otpErr.message.includes("rate limit")) {
          setError("Too many attempts. Please wait a moment and try again.");
        } else {
          setError(otpErr.message || "Failed to send verification code.");
        }
        return;
      }

      // Save email for verification step
      localStorage.setItem("roam_register_email", cleanEmail);

      setMsg("Verification code sent. Check your email.");

      // Small delay for better UX
      setTimeout(() => {
        nav(`/verify-register?email=${encodeURIComponent(cleanEmail)}`, {
          replace: true,
        });
      }, 800);
    } catch (err) {
      console.error("Register error:", err);
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">
          ROAM
        </h1>
        <p className="text-center text-gray-400 mb-8">Create Account</p>

        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 rounded-3xl border border-gray-800 p-6 space-y-4 shadow-sm"
        >
          {/* Email Input */}
          <input
            type="email"
            placeholder="Email"
            className={darkInputClass}
            style={{ WebkitTextFillColor: "#ffffff" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            inputMode="email"
          />

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send verification code"}
          </button>

          {/* Messages */}
          {msg && <p className="text-center text-sm text-green-400">{msg}</p>}
          {error && <p className="text-center text-sm text-red-400">{error}</p>}

          {/* Footer Links */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => nav("/login")}
              className="text-sm text-gray-400 hover:underline"
            >
              ← Back to Login
            </button>

            <button
              type="button"
              onClick={() => nav("/forgot")}
              className="text-sm text-orange-500 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}