import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setError("Please enter your email.");
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(error.message || "Failed to send verification code.");
        return;
      }

      localStorage.setItem("roam_register_email", cleanEmail);
      localStorage.setItem("roam_register_pending", "1");

      nav("/verify-register", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Unexpected error while sending verification code.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-4xl font-bold text-orange-600">
          ROAM
        </h1>
        <p className="mb-8 text-center text-gray-500 dark:text-gray-400">
          Create your account
        </p>

        <form
          onSubmit={onSubmit}
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

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-2xl bg-orange-600 py-3 text-lg font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Create account"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="pt-1 text-center">
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