import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function Settings() {
  const nav = useNavigate();

  async function sendPasswordReset() {
    const { data, error: sessionErr } = await supabase.auth.getUser();
    if (sessionErr) {
      console.error(sessionErr);
      alert("Could not read session. Please log in again.");
      return;
    }
    const user = data.user;
    if (!user?.email) {
      alert("No email found for the current user.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset`,
    });

    if (error) {
      console.error(error);
      alert("Failed to send password reset email.");
    } else {
      alert("Password reset email sent. Please check your inbox.");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    localStorage.clear();
    nav("/login", { replace: true });
  }

  function clearLocalCache() {
    localStorage.clear();
    alert("Local cache cleared.");
  }

  return (
    <div className="min-h-screen bg-white px-4 py-4 pb-28">
      <h1 className="text-2xl font-bold mb-4 text-neutral-900">Settings</h1>

      {/* Security */}
      <section className="mb-4 rounded-2xl border border-neutral-200 bg-white">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-800">Security</h2>
        </div>

        <div className="px-4 pb-4 pt-3">
          <button
            onClick={sendPasswordReset}
            className="w-full rounded-2xl bg-transparent border border-neutral-300 text-neutral-800 py-2.5 font-semibold hover:bg-neutral-50 transition"
          >
            Send password reset email
          </button>
        </div>
      </section>

      {/* Maintenance */}
      <section className="mb-4 rounded-2xl border border-neutral-200 bg-white">
        <div className="px-4 py-3 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-800">Maintenance</h2>
        </div>

        <div className="px-4 py-2">
          <button
            onClick={() => nav("/profile")}
            className="w-full mb-2 rounded-2xl border border-neutral-300 text-neutral-800 py-2.5 font-semibold hover:bg-neutral-50 transition"
          >
            Manage profile
          </button>

          <button
            onClick={clearLocalCache}
            className="w-full rounded-2xl border border-neutral-300 text-neutral-800 py-2.5 font-semibold hover:bg-neutral-50 transition"
          >
            Clear local cache
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3">
        <h2 className="font-semibold text-red-700 mb-2">Danger Zone</h2>
        <button
          onClick={handleLogout}
          className="w-full rounded-2xl bg-orange-600 text-white py-2.5 font-semibold active:bg-orange-700"
        >
          Log Out
        </button>
      </section>
    </div>
  );
}