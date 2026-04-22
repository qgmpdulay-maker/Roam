import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Verify() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  useEffect(() => {
    const savedEmail = localStorage.getItem("roam_register_email") || "";
    if (!savedEmail) {
      setError("Missing email. Please go back and enter your email again.");
      return;
    }
    setEmail(savedEmail);
  }, []);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanCode = code.trim();

    if (!email) {
      setError("Missing email. Please go back and enter your email again.");
      return;
    }

    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    setVerifying(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: cleanCode,
        type: "email",
      });

      if (error) {
        setError(error.message || "Invalid verification code.");
        return;
      }

      nav("/set-password", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Unexpected error during verification.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError("");

    if (!email) {
      setError("Missing email. Please go back and enter your email again.");
      return;
    }

    setResending(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        setError(error.message || "Failed to resend code.");
      }
    } catch (err) {
      console.error(err);
      setError("Unexpected error while resending code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-4xl font-bold text-orange-600">
          ROAM
        </h1>
        <p className="mb-2 text-center text-gray-500 dark:text-gray-400">
          Enter the 6-digit code sent to
        </p>
        <p className="mb-8 text-center text-sm text-gray-700 dark:text-gray-300">
          {email || "your email"}
        </p>

        <form
          onSubmit={handleVerify}
          className="space-y-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            required
          />

          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-2xl bg-orange-600 py-3 text-lg font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Verify code"}
          </button>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full rounded-2xl border border-gray-300 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {resending ? "Resending…" : "Resend code"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={() => nav("/register")}
              className="text-sm text-gray-500 hover:underline dark:text-gray-400"
            >
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}