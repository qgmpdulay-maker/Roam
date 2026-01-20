import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getPrefs, savePrefs, applyPrefs, ThemeMode, TextSize } from "@/lib/uiPrefs";

export default function Settings() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  const [theme, setTheme] = useState<ThemeMode>("light");
  const [textSize, setTextSize] = useState<TextSize>("md");

  useEffect(() => {
    // Email
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data?.user?.email ?? "");
    });

    // Load saved prefs + apply immediately
    const p = getPrefs();
    setTheme(p.theme);
    setTextSize(p.textSize);
    applyPrefs();
  }, []);

  async function sendPasswordReset() {
    if (!email) {
      alert("Unable to get your email.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) alert(error.message);
    else alert("Password reset email sent.");
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="p-4 pb-28 space-y-4 bg-white dark:bg-gray-950">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
        Settings
      </h1>

      {/* Security */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Security
        </h2>

        <button
          onClick={sendPasswordReset}
          className="w-full rounded-xl border border-gray-300 py-3 text-sm font-medium bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-white"
        >
          Send password reset email
        </button>
      </div>

      {/* Account */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Account
        </h2>

        <button
          onClick={() => navigate("/profile")}
          className="w-full rounded-xl border border-gray-300 py-3 text-sm font-medium bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-white"
        >
          Manage profile
        </button>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 dark:text-gray-400">
            Signed-in email
          </label>
          <input
            value={email}
            readOnly
            className="w-full rounded-xl border p-2.5 bg-gray-50 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>
      </div>

      {/* Preferences */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Preferences
        </h2>

        {/* Appearance (Light/Dark only) */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Appearance
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Light or Dark mode
            </div>
          </div>

          <select
            value={theme}
            onChange={(e) => {
              const v = e.target.value as ThemeMode;
              setTheme(v);
              savePrefs({ theme: v }); // save + apply
            }}
            className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        {/* Text size (segmented control — no black text in dark mode) */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Text size
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Adjust readability
            </div>
          </div>

          <div className="flex overflow-hidden rounded-2xl border border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40">
            <button
              type="button"
              onClick={() => {
                setTextSize("sm");
                savePrefs({ textSize: "sm" });
              }}
              className={`px-4 py-2 text-sm font-semibold transition ${
                textSize === "sm"
                  ? "bg-gray-900 text-white dark:bg-gray-800 dark:text-white"
                  : "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              A-
            </button>

            <div className="w-px bg-gray-300 dark:bg-gray-700" />

            <button
              type="button"
              onClick={() => {
                setTextSize("md");
                savePrefs({ textSize: "md" });
              }}
              className={`px-4 py-2 text-sm font-semibold transition ${
                textSize === "md"
                  ? "bg-gray-900 text-white dark:bg-gray-800 dark:text-white"
                  : "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              A
            </button>

            <div className="w-px bg-gray-300 dark:bg-gray-700" />

            <button
              type="button"
              onClick={() => {
                setTextSize("lg");
                savePrefs({ textSize: "lg" });
              }}
              className={`px-4 py-2 text-sm font-semibold transition ${
                textSize === "lg"
                  ? "bg-gray-900 text-white dark:bg-gray-800 dark:text-white"
                  : "text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 dark:bg-gray-900 dark:border-gray-800">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          About
        </h2>

        <InfoRow label="Application" value="ROAM Mobile Web" />
        <InfoRow label="Version" value="v1.0.0" />
        <InfoRow label="Environment" value="Production" />
      </div>

      {/* Log out at bottom */}
      <div className="pt-2">
        <button
          onClick={logout}
          className="w-full rounded-2xl bg-orange-600 py-3 text-white font-semibold hover:bg-orange-700 active:bg-orange-800"
        >
          Log out
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}