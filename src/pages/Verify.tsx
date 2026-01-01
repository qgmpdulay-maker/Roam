import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Verify() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const pending = localStorage.getItem("roam_pending_email") || "";
    setEmail(pending);
    if (!pending) nav("/login", { replace: true });
  }, [nav]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email", // verifyOtp DOES need 'type'
      });
      if (vErr) {
        setError(vErr.message || "Invalid code. Please try again.");
        return;
      }
      localStorage.removeItem("roam_otp_required");
      localStorage.removeItem("roam_pending_email");
      nav("/dashboard", { replace: true });
    } catch (err: any) {
      console.error(err);
      setError("Unexpected error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setInfo(""); setError("");
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }, // no `type` here
    });
    if (error) setError(error.message || "Failed to resend code.");
    else setInfo("A new code has been sent.");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-white px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-1">Enter Verification Code</h1>
        <p className="text-center text-gray-600 mb-6">
          We emailed a 6-digit code to <span className="font-medium">{email}</span>.
        </p>

        <form onSubmit={handleVerify} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <input
            inputMode="numeric"
            placeholder="6-digit code"
            className="w-full rounded-xl border border-gray-300 p-3 text-xl tracking-widest text-center"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>

          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          {info && <p className="text-center text-sm text-green-600">{info}</p>}

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={resend} className="text-sm text-gray-600 hover:underline">
              Resend code
            </button>
            <button type="button" onClick={() => nav("/login")} className="text-sm text-orange-600 hover:underline">
              Back
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}