import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,}$/;

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
    if (h) return setError(h);
    if (pw !== pw2) return setError("Passwords do not match.");

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
      <div className="min-h-screen grid place-items-center bg-white px-4">
        <p className="text-sm text-gray-600">Loading…</p>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="min-h-screen grid place-items-center bg-white px-4">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
          <p className="text-center text-gray-600 mb-6">Set Password</p>

          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <p className="text-sm text-gray-700">
              Please verify your email code first.
            </p>

            <button
              type="button"
              onClick={() => nav("/register")}
              className="w-full rounded-2xl border border-gray-300 text-gray-800 py-2.5 font-semibold hover:bg-gray-50"
            >
              Go to Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-orange-600 mb-1 text-center">ROAM</h1>
        <p className="text-center text-gray-600 mb-6">Set Password</p>

        <form
          onSubmit={save}
          className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3"
        >
          <input
            type="password"
            placeholder="New password"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            autoComplete="new-password"
            required
          />

          <input
            type="password"
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-gray-600 bg-gray-800 p-3 text-sm text-white placeholder-gray-400"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            autoComplete="new-password"
            required
          />

          <p className={`text-xs ${hint ? "text-gray-600" : "text-green-600"}`}>
            {hint || "Password format looks good."}
          </p>

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Set password"}
          </button>

          {msg && <p className="text-center text-sm text-green-600">{msg}</p>}
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}