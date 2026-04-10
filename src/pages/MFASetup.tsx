import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function MFASetup() {
  const [qrSvg, setQrSvg] = useState<string>("");
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "enrolling" | "verifying" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string>("");
  const navigate = useNavigate();

  const inputClass =
    "w-full rounded-2xl border border-gray-300 bg-white p-3 text-base text-gray-900 placeholder-gray-400 caret-gray-900 outline-none focus:border-orange-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 dark:caret-white";

  async function startEnroll() {
    try {
      setStatus("enrolling");
      setError("");

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });

      if (error) throw error;

      setFactorId((data as any).id);
      setQrSvg((data as any).totp?.qr_code || (data as any).qr_code || "");
      setStatus("idle");
    } catch (e: any) {
      console.error("enroll error:", e);
      setError(e.message ?? "Enroll failed");
      setStatus("error");
    }
  }

  async function verify() {
    try {
      setStatus("verifying");
      setError("");

      const { error } = await (supabase.auth.mfa as any).verify({
        factorId,
        code: code.trim(),
      });

      if (error) throw error;

      setStatus("done");
      setTimeout(() => navigate("/dashboard", { replace: true }), 600);
    } catch (e: any) {
      console.error("verify error:", e);
      setError(e.message ?? "Verification failed");
      setStatus("error");
    }
  }

  useEffect(() => {
    startEnroll();
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 px-4 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold text-center">
          Two-Factor Authentication
        </h1>

        <p className="text-sm text-gray-500 text-center dark:text-gray-400">
          Scan the QR code using Google Authenticator (or any TOTP app), then
          enter the 6-digit code.
        </p>

        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {qrSvg ? (
            <div
              className="flex items-center justify-center"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="text-center text-gray-500 dark:text-gray-400 text-sm">
              Preparing QR code…
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <input
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="6-digit code"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
          />

          <button
            onClick={verify}
            disabled={!factorId || code.length < 6 || status === "verifying"}
            className="rounded-2xl bg-orange-600 px-4 text-white font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {status === "verifying" ? "Verifying…" : "Verify"}
          </button>
        </div>

        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}
        {status === "done" && (
          <p className="text-center text-sm text-green-600">
            MFA enabled!
          </p>
        )}
      </div>
    </div>
  );
}