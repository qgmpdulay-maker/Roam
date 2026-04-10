import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Forgot() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email.");
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
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
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">
          ROAM
        </h1>
        <p className="text-center text-gray-500 mb-8 dark:text-gray-400">
          Reset your password
        </p>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4 shadow-sm dark:bg-gray-900 dark:border-gray-800"
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

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send reset link"}
          </button>

          {error && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}
          {info && (
            <p className="text-center text-sm text-green-600">{info}</p>
          )}

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={() => nav("/login")}
              className="text-sm text-gray-500 hover:underline dark:text-gray-400"
            >
              Back to sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}