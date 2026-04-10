import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

const inputClass =
  "w-full rounded-2xl border border-gray-300 bg-white p-4 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

function passwordHint(pw: string) {
  const missing: string[] = [];
  if (pw.length < 8) missing.push("at least 8 characters");
  if (!/[A-Z]/.test(pw)) missing.push("1 capital letter");
  if (!/\d/.test(pw)) missing.push("1 number");
  if (!/[^\w\s]/.test(pw)) missing.push("1 symbol");
  return missing.length ? `Password needs: ${missing.join(", ")}.` : "";
}

export default function SetPassword() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hint = useMemo(() => passwordHint(pw), [pw]);

  const canSubmit = useMemo(() => {
    if (!PASSWORD_REGEX.test(pw)) return false;
    if (pw !== pw2) return false;
    return true;
  }, [pw, pw2]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");

    if (!hasSession) {
      setError("No active session. Please verify your code first.");
      nav("/register", { replace: true });
      return;
    }

    const h = passwordHint(pw);
    if (h) {
      setError(h);
      return;
    }

    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: pw });

      if (upErr) {
        setError(`Could not set password: ${upErr.message}`);
        console.error("updateUser error:", upErr);
        return;
      }

      setMsg("Password set! Redirecting to login…");
      setTimeout(() => nav("/login"), 800);
    } finally {
      setLoading(false);
    }
  }

  if (hasSession === null) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        <div className="w-full max-w-sm">
          <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
          <p className="text-center text-gray-500 mb-8 dark:text-gray-400">Set Password</p>

          <div className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
            <p className="text-sm text-gray-600 text-center dark:text-gray-300">
              Please verify your email code first.
            </p>

            <button
              type="button"
              onClick={() => nav("/register")}
              className="w-full rounded-2xl border border-gray-300 bg-white py-3 text-gray-900 text-lg font-semibold hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
            >
              Go to Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-bold text-orange-600 mb-2 text-center">ROAM</h1>
        <p className="text-center text-gray-500 mb-8 dark:text-gray-400">Set Password</p>

        <form
          onSubmit={save}
          className="bg-white rounded-3xl border border-gray-200 p-6 space-y-4 shadow-sm dark:bg-gray-900 dark:border-gray-800"
        >
          <input
            type="password"
            placeholder="New password"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            required
          />

          <input
            type="password"
            placeholder="Confirm new password"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            required
          />

          <p className={`text-xs ${hint ? "text-gray-500 dark:text-gray-400" : "text-green-600"}`}>
            {hint || "Password format looks good."}
          </p>

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full rounded-2xl bg-orange-600 py-3 text-white text-lg font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Set password"}
          </button>

          {msg && <p className="text-center text-sm text-green-600">{msg}</p>}
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
        </form>
      </div>
    </div>
  );
}