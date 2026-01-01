import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Reset() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message);
      } else {
        setSuccess("Password updated successfully! Redirecting to login...");
        setTimeout(() => nav("/login", { replace: true }), 2500);
      }
    } catch {
      setError("Unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 text-center">
        <h2 className="text-2xl font-bold mb-4">Set New Password</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-left">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              type="password"
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-gray-300 p-3 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="text-left">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm password
            </label>
            <input
              type="password"
              placeholder="Confirm password"
              className="w-full rounded-xl border border-gray-300 p-3 text-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 text-white font-semibold py-2.5 rounded-2xl active:bg-orange-600 disabled:opacity-50"
          >
            {loading ? "Updating…" : "Update Password"}
          </button>

          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
          {success && <p className="text-green-600 text-sm mt-2">{success}</p>}
        </form>

        <p className="text-gray-500 text-sm mt-4">
          After saving, you’ll be redirected to login.
        </p>

        <button
          onClick={() => nav("/login")}
          className="mt-4 text-sm text-orange-600 hover:underline font-medium"
        >
          ← Back to Login
        </button>
      </div>
    </div>
  );
}