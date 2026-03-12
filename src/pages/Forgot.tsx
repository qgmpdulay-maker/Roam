import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Forgot() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const darkInputClass =
    "w-full rounded-2xl border border-gray-600 bg-gray-800 p-4 text-base text-white placeholder-gray-400 caret-white outline-none focus:border-orange-500";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
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
    <div className="min-h-screen grid place-items-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
        <p className="text-center text-gray-400 mb-8">Reset your password</p>

        <form
          onSubmit={onSubmit}
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

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send reset link"}
          </button>

          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          {info && <p className="text-center text-sm text-green-400">{info}</p>}

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => nav("/login")}
              className="text-sm text-gray-400 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}