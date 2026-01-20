import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type DeskOfficer = {
  id: string;
  account_id: string | null;
  email: string | null;
  full_name: string | null;
  contact_number: string | null;
  street_assignment: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

type ViolationLite = {
  id: string;
  resolved_at: string | null;
  status: string | null;
};

const AVATAR_BUCKET = "avatars";

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard?.writeText(text).catch(() => {});
}

export default function Profile() {
  const [userId, setUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [profile, setProfile] = useState<DeskOfficer | null>(null);
  const [fullName, setFullName] = useState("");
  const [contact, setContact] = useState("");
  const [avatar, setAvatar] = useState("");
  const [street, setStreet] = useState("Unassigned");

  // NEW: quick stats
  const [resolvedCount, setResolvedCount] = useState<number>(0);
  const [pendingOnMyStreetCount, setPendingOnMyStreetCount] = useState<number>(0);
  const [lastResolvedAt, setLastResolvedAt] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);

  // 1) Get current auth user
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const u = data?.user ?? null;
      setUserId(u?.id ?? null);
      setAuthEmail(u?.email ?? "");
    })();
  }, []);

  // 2) Load profile WITHOUT inserting anything
  useEffect(() => {
    if (!userId || !authEmail) return;

    (async () => {
      setLoading(true);
      setError("");
      setMsg("");

      // Try by account_id first
      const byId = await supabase
        .from("desk_officers")
        .select("*")
        .eq("account_id", userId)
        .maybeSingle<DeskOfficer>();

      if (byId.error && byId.error.code !== "PGRST116") {
        setError(byId.error.message);
        setLoading(false);
        return;
      }

      let row = byId.data;

      if (!row) {
        // Fallback by email (case-insensitive)
        const byEmail = await supabase
          .from("desk_officers")
          .select("*")
          .ilike("email", authEmail)
          .maybeSingle<DeskOfficer>();

        if (byEmail.error && byEmail.error.code !== "PGRST116") {
          setError(byEmail.error.message);
          setLoading(false);
          return;
        }

        row = byEmail.data;

        // If there is an email row with NULL account_id, claim it for this user
        if (row && !row.account_id) {
          const claim = await supabase
            .from("desk_officers")
            .update({ account_id: userId })
            .eq("id", row.id)
            .select()
            .single<DeskOfficer>();

          if (claim.error) {
            // If someone else raced & claimed it, just re-check by account_id
            const recheck = await supabase
              .from("desk_officers")
              .select("*")
              .eq("account_id", userId)
              .maybeSingle<DeskOfficer>();

            if (recheck.error && recheck.error.code !== "PGRST116") {
              setError(recheck.error.message);
              setLoading(false);
              return;
            }
            row = recheck.data ?? row;
          } else {
            row = claim.data;
          }
        }
      }

      if (!row) {
        setProfile(null);
        setError(
          "No desk officer profile was found for your account. Please ask an admin to add you to public.desk_officers."
        );
        setLoading(false);
        return;
      }

      // Bind to state
      setProfile(row);
      setFullName(row.full_name ?? "");
      setContact(row.contact_number ?? "");
      setAvatar(row.avatar_url ?? "");
      setStreet(row.street_assignment ?? "Unassigned");

      setLoading(false);
    })();
  }, [userId, authEmail]);

  // 3) Load quick stats once profile is available
  useEffect(() => {
    if (!profile?.account_id) return;

    let cancelled = false;

    (async () => {
      try {
        setStatsLoading(true);

        // Resolved count (by this user)
        const { count: resolved, error: rErr } = await supabase
          .from("violations")
          .select("id", { count: "exact", head: true })
          .eq("resolved_by", profile.account_id)
          .eq("status", "resolved");

        if (rErr) throw rErr;

        // Pending on my assigned street (motivational workload)
        // If street is "Unassigned", skip
        let pendingStreet = 0;
        if ((profile.street_assignment ?? "Unassigned") !== "Unassigned") {
          const { count: pending, error: pErr } = await supabase
            .from("violations")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending")
            .eq("street_name", profile.street_assignment ?? "");

          if (pErr) throw pErr;
          pendingStreet = pending ?? 0;
        }

        // Last resolved time
        const { data: lastRow, error: lErr } = await supabase
          .from("violations")
          .select("id,resolved_at,status")
          .eq("resolved_by", profile.account_id)
          .eq("status", "resolved")
          .order("resolved_at", { ascending: false })
          .limit(1)
          .maybeSingle<ViolationLite>();

        if (lErr && lErr.code !== "PGRST116") throw lErr;

        if (!cancelled) {
          setResolvedCount(resolved ?? 0);
          setPendingOnMyStreetCount(pendingStreet);
          setLastResolvedAt(lastRow?.resolved_at ?? null);
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) {
          // Don't block profile page if stats fail
          setResolvedCount(0);
          setPendingOnMyStreetCount(0);
          setLastResolvedAt(null);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile?.account_id, profile?.street_assignment]);

  // Save updates (only if a row exists)
  async function save() {
    if (!profile) return;

    setSaving(true);
    setError("");
    setMsg("");

    const upd = await supabase
      .from("desk_officers")
      .update({
        full_name: fullName,
        contact_number: contact,
        avatar_url: avatar,
      })
      .eq("id", profile.id)
      .select()
      .single<DeskOfficer>();

    if (upd.error) {
      setError(upd.error.message);
      setSaving(false);
      return;
    }

    setProfile(upd.data);
    setMsg("Profile saved.");
    setSaving(false);
  }

  // Upload avatar
  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!profile) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    setMsg("");

    try {
      const path = `${profile.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      setAvatar(url);
      setMsg("Avatar uploaded. Don’t forget to Save Changes.");
    } catch (err: any) {
      setError(err.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeAvatar() {
    setAvatar("");
    setMsg("Avatar cleared. Don’t forget to Save Changes.");
  }

  function initials(name: string) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "U";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "U";
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  const completeness = useMemo(() => {
    // simple scoring: name, contact, avatar
    let score = 0;
    if (fullName.trim().length >= 2) score += 1;
    if (contact.trim().length >= 7) score += 1;
    if (avatar.trim().length > 0) score += 1;
    const pct = Math.round((score / 3) * 100);
    return { score, pct };
  }, [fullName, contact, avatar]);

  if (loading) return <div className="p-4 text-sm text-gray-500">Loading profile…</div>;

  if (!profile) {
    return (
      <div className="p-4 space-y-3">
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-800">
          We couldn’t load your profile. Please contact an admin to add a row in{" "}
          <b>public.desk_officers</b>.
        </div>
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 space-y-4">
      <h1 className="text-xl font-semibold">Profile</h1>

      {msg && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-700">
          {msg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {/* NEW: Quick stats */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-gray-600">Officer Performance</div>
            <div className="text-xs text-gray-500">
              {statsLoading ? "Updating…" : "Live from violations table"}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-gray-500">Role</div>
            <div className="text-sm font-semibold text-gray-900">Desk Officer</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Resolved Violations</div>
            <div className="text-2xl font-bold">{resolvedCount}</div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Pending Violations</div>
            <div className="text-2xl font-bold">{pendingOnMyStreetCount}</div>
          </div>

          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs text-gray-500">Last resolved</div>
            <div className="text-sm font-semibold">{fmtDateTime(lastResolvedAt)}</div>
          </div>
        </div>
      </div>

      {/* Avatar card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-full bg-gray-100 border border-gray-200 overflow-hidden grid place-items-center text-lg font-semibold">
            {avatar ? (
              <img src={avatar} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="text-gray-500">{initials(fullName || authEmail)}</span>
            )}
          </div>

          <div className="flex-1">
            <div className="text-sm text-gray-600 mb-2">Profile Photo</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-xl border border-gray-300 px-3 py-1.5 text-sm bg-white hover:bg-gray-50">
                {uploading ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                  disabled={uploading}
                />
              </label>
              <button
                type="button"
                onClick={removeAvatar}
                className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm bg-white hover:bg-gray-50"
              >
                Remove
              </button>
              {avatar && (
                <a
                  href={avatar}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-orange-600 hover:underline"
                >
                  Open image
                </a>
              )}
            </div>

            {/* NEW: completeness */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Profile completeness</span>
                <span>{completeness.pct}%</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-orange-600"
                  style={{ width: `${completeness.pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500">Email</label>
          <input value={profile.email ?? ""} readOnly className="mt-1 w-full rounded-xl border p-2.5 bg-gray-50" />
        </div>

        {/* NEW: IDs row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Officer ID</label>
            <div className="mt-1 flex gap-2">
              <input
                value={profile.id}
                readOnly
                className="w-full rounded-xl border p-2.5 bg-gray-50 text-xs"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(profile.id)}
                className="shrink-0 rounded-xl border border-gray-300 px-3 text-sm bg-white hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500">Account ID</label>
            <div className="mt-1 flex gap-2">
              <input
                value={profile.account_id ?? userId ?? ""}
                readOnly
                className="w-full rounded-xl border p-2.5 bg-gray-50 text-xs"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(profile.account_id ?? userId ?? "")}
                className="shrink-0 rounded-xl border border-gray-300 px-3 text-sm bg-white hover:bg-gray-50"
              >
                Copy
              </button>
            </div>
          </div>
        </div>

        {/* NEW: joined date */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500">Joined</label>
            <input
              value={fmtDate(profile.created_at)}
              readOnly
              className="mt-1 w-full rounded-xl border p-2.5 bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Assigned Street (admin-set)</label>
            <input value={street} readOnly className="mt-1 w-full rounded-xl border p-2.5 bg-gray-50" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Full Name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-xl border p-2.5"
            placeholder="Juan Dela Cruz"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500">Contact Number</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className="mt-1 w-full rounded-xl border p-2.5"
            placeholder="09xxxxxxxxx"
          />
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl bg-orange-600 py-2.5 text-white font-semibold active:bg-orange-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}