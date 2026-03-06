import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Forgot() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!email) {
      setError("Please enter your email.");
      return;
    }
    setSending(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset`,
      });
      if (error) {
        setError(error.message);
      } else {
        setInfo("A password reset link has been sent to your email.");
      }
    } catch {
      setError("Unexpected error while sending reset email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Reset your password</p>

        <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <input
            type="email"
            placeholder="Email"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send reset link"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          {info && <p className="text-center text-sm text-green-600">{info}</p>}

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => nav("/login")}
              className="text-sm text-gray-600 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}