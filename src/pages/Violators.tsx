import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

type ViolatorRow = {
  id: string;
  full_name: string | null;
  license_plate: string | null;
  address?: string | null;
  contact_no?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  has_driver_license?: boolean | null;
  has_orcr?: boolean | null;
  note?: string | null;
};

type ViolationHistoryRow = {
  id: string;
  timestamp: string | null;
  status: string | null;
  street_name: string | null;
  violation_type: string | null;
  vehicle_class: string | null;
  license_plate: string | null;
  violator_id?: string | null;

  // ✅ possible image columns on violations
  driver_image_url?: string | null;
  vehicle_image_url?: string | null;
  image_url?: string | null;
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function normLower(s: any) {
  return norm(s).toLowerCase();
}

function prettyDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function pillClassForStatus(status?: string | null) {
  const s = normLower(status);
  if (s === "resolved") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "pending") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-neutral-50 text-neutral-700 border-neutral-200";
}

// chunk helper for Supabase IN(...) limits
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function Violators() {
  const nav = useNavigate();

  const [rows, setRows] = useState<ViolatorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // plate -> vehicle_type (from violations table)
  const [plateToVehicle, setPlateToVehicle] = useState<Record<string, string>>({});

  // ✅ violatorId -> thumbnail image url (latest violation image)
  const [violatorThumbs, setViolatorThumbs] = useState<Record<string, string>>({});

  // Search + filter
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");

  // Expanded history state (lazy loaded)
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByViolator, setHistoryByViolator] = useState<Record<string, ViolationHistoryRow[]>>(
    {}
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyErrorById, setHistoryErrorById] = useState<Record<string, string>>({});

  // ✅ IMPORTANT: ensure these match your DB
  const VIOLATORS_TABLE = "violators";
  const VIOLATIONS_TABLE = "violations";
  const VIOLATIONS_PLATE_COL = "license_plate";
  const VIOLATIONS_VEHICLE_COL = "vehicle_class";
  const VIOLATIONS_TIME_COL = "timestamp";

  useEffect(() => {
    let cancelled = false;

    async function fetchViolators() {
      setLoading(true);
      setError("");

      try {
        const { data, error } = await supabase
          .from(VIOLATORS_TABLE)
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        const list = (data ?? []) as ViolatorRow[];
        if (!cancelled) setRows(list);

        // After violators load, fetch vehicle types for plates
        const plates = list.map((r) => norm(r.license_plate)).filter(Boolean);

        if (!cancelled) {
          const mapping = await fetchVehicleTypesForPlates(plates);
          if (!cancelled) setPlateToVehicle(mapping);
        }

        // ✅ Fetch thumbnails (latest photo per violator)
        // Do sequentially to reduce DB burst; small list is fine.
        for (const r of list) {
          if (cancelled) break;
          if (!r?.id) continue;

          const plate = norm(r.license_plate);

          const img = await fetchLatestImageForViolator(r.id, plate);
          if (cancelled) break;

          if (img) {
            setViolatorThumbs((prev) => ({ ...prev, [r.id]: img }));
          }
        }
      } catch (e: any) {
        console.error("Violators fetch error:", e);
        if (!cancelled) setRows([]);
        if (!cancelled)
          setError(
            e?.message ?? `Failed to load ${VIOLATORS_TABLE}. Check table name and RLS.`
          );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchViolators();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchVehicleTypesForPlates(plates: string[]) {
    if (!plates.length) return {};

    const mapping: Record<string, { vehicle: string; time: number }> = {};
    const plateChunks = chunk(plates, 100);

    for (const part of plateChunks) {
      const { data, error } = await supabase
        .from(VIOLATIONS_TABLE)
        .select(`${VIOLATIONS_PLATE_COL},${VIOLATIONS_VEHICLE_COL},${VIOLATIONS_TIME_COL}`)
        .in(VIOLATIONS_PLATE_COL, part)
        .order(VIOLATIONS_TIME_COL, { ascending: false });

      if (error) {
        console.error("Vehicle type lookup error:", error);
        continue;
      }

      const list = (data ?? []) as any[];

      for (const r of list) {
        const plate = norm(r?.[VIOLATIONS_PLATE_COL]);
        const vehicle = norm(r?.[VIOLATIONS_VEHICLE_COL]);
        const tRaw = r?.[VIOLATIONS_TIME_COL];

        if (!plate || !vehicle) continue;

        const t = new Date(tRaw ?? "").getTime();
        const time = isNaN(t) ? 0 : t;

        if (!mapping[plate] || time >= mapping[plate].time) {
          mapping[plate] = { vehicle, time };
        }
      }
    }

    const out: Record<string, string> = {};
    for (const plate of Object.keys(mapping)) out[plate] = mapping[plate].vehicle;
    return out;
  }

  // ✅ Latest image for violator (driver -> vehicle -> evidence fallback)
  async function fetchLatestImageForViolator(violatorId: string, plate: string) {
    const cleanPlate = norm(plate);

    // Try via violator_id first; fallback via plate match (for older rows)
    const { data, error } = await supabase
      .from(VIOLATIONS_TABLE)
      .select("driver_image_url,vehicle_image_url,image_url,timestamp,license_plate,violator_id")
      .or(
        cleanPlate
          ? `violator_id.eq.${violatorId},license_plate.ilike.${cleanPlate}`
          : `violator_id.eq.${violatorId}`
      )
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Thumbnail fetch error:", error);
      return null;
    }

    const row = data as any;

    return row?.driver_image_url || row?.vehicle_image_url || row?.image_url || null;
  }

  async function fetchViolationHistoryForViolator(violatorId: string, plate: string) {
    // First try: proper relational link via violator_id
    const q1 = supabase
      .from(VIOLATIONS_TABLE)
      .select(
        "id,timestamp,status,street_name,violation_type,vehicle_class,license_plate,violator_id,driver_image_url,vehicle_image_url,image_url"
      )
      .eq("violator_id", violatorId)
      .order("timestamp", { ascending: false })
      .limit(30);

    const { data: d1, error: e1 } = await q1;
    if (e1) throw e1;

    const list1 = (d1 ?? []) as ViolationHistoryRow[];
    if (list1.length > 0) return list1;

    // Fallback: match by license_plate (if older rows didn’t set violator_id)
    const p = norm(plate);
    if (!p) return list1;

    const q2 = supabase
      .from(VIOLATIONS_TABLE)
      .select(
        "id,timestamp,status,street_name,violation_type,vehicle_class,license_plate,violator_id,driver_image_url,vehicle_image_url,image_url"
      )
      .ilike("license_plate", p)
      .order("timestamp", { ascending: false })
      .limit(30);

    const { data: d2, error: e2 } = await q2;
    if (e2) throw e2;

    return (d2 ?? []) as ViolationHistoryRow[];
  }

  async function toggleHistory(violatorId: string, plate: string) {
    if (expandedId === violatorId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(violatorId);

    if (historyByViolator[violatorId]) return;

    setHistoryLoadingId(violatorId);
    setHistoryErrorById((prev) => ({ ...prev, [violatorId]: "" }));

    try {
      const items = await fetchViolationHistoryForViolator(violatorId, plate);
      setHistoryByViolator((prev) => ({ ...prev, [violatorId]: items }));
    } catch (e: any) {
      console.error("History fetch error:", e);
      setHistoryByViolator((prev) => ({ ...prev, [violatorId]: [] }));
      setHistoryErrorById((prev) => ({
        ...prev,
        [violatorId]:
          e?.message ?? "Could not load violation history. Check RLS on violations table.",
      }));
    } finally {
      setHistoryLoadingId(null);
    }
  }

  const vehicleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const plate = norm(r.license_plate);
      const vt = norm(plateToVehicle[plate]);
      if (vt) set.add(vt);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows, plateToVehicle]);

  const filtered = useMemo(() => {
    const query = normLower(q);

    return rows.filter((r) => {
      const plate = normLower(r.license_plate);
      const name = normLower(r.full_name);

      const vt = normLower(plateToVehicle[norm(r.license_plate)]);

      const matchQuery = !query || plate.includes(query) || name.includes(query);
      const matchVehicle = vehicleFilter === "all" || normLower(vehicleFilter) === vt;

      return matchQuery && matchVehicle;
    });
  }, [rows, q, vehicleFilter, plateToVehicle]);

  return (
    <div className="page space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Violators</h1>
          <p className="text-sm text-muted">
            {loading ? "Loading…" : `${filtered.length} result(s)`} • {rows.length} total
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          <div className="font-semibold">Couldn’t load violators</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-[12px] text-red-600/90">
            If it says “permission denied” / “RLS”, you need a SELECT policy for authenticated
            users on <b>{VIOLATORS_TABLE}</b> (and maybe <b>{VIOLATIONS_TABLE}</b> too).
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
          <div className="md:col-span-2">
            <label className="roam-label">Search</label>
            <input
              className="roam-input mt-1"
              placeholder="Search plate number or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div>
            <label className="roam-label">Vehicle type</label>
            <select
              className="roam-input mt-1"
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
            >
              {vehicleOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "all" ? "All" : opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Showing <b className="text-main">{filtered.length}</b> of{" "}
            <b className="text-main">{rows.length}</b>
          </span>

          <button
            type="button"
            className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
            onClick={() => {
              setQ("");
              setVehicleFilter("all");
              setExpandedId(null);
            }}
            disabled={loading}
          >
            Reset
          </button>
        </div>
      </div>

      {/* List */}
      <div className="card p-2">
        {loading ? (
          <div className="p-4 text-sm text-muted">Loading violators…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted">
            No violators found. Try another keyword or vehicle type.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-gray-800">
            {filtered.map((r, idx) => {
              const plate = norm(r.license_plate);
              const name = norm(r.full_name);
              const created = norm(r.created_at);

              const vehicleType = norm(plateToVehicle[plate]);
              const isOpen = expandedId === r.id;

              const history = historyByViolator[r.id];
              const histLoading = historyLoadingId === r.id;
              const histError = historyErrorById[r.id];

              const thumb = violatorThumbs[r.id];

              return (
                <div key={r.id ?? `${plate}-${idx}`} className="p-3">
                  <div className="flex items-start gap-3">
                    {/* ✅ Thumbnail */}
                    <div className="shrink-0 h-14 w-14 rounded-xl overflow-hidden border border-neutral-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt="violator"
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-[10px] text-gray-500">
                          No Photo
                        </div>
                      )}
                    </div>

                    {/* Main row content */}
                    <div className="flex-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold text-main truncate">
                            {plate || "— Plate —"}
                          </div>

                          {vehicleType ? (
                            <span className="pill">{vehicleType}</span>
                          ) : (
                            <span className="pill">Unknown vehicle</span>
                          )}
                        </div>

                        <div className="mt-1 text-sm text-sub truncate">
                          {name || "— No name —"}
                        </div>

                        <div className="mt-1 text-xs text-muted">
                          Added: {prettyDate(created)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                          onClick={() => navigator.clipboard?.writeText(plate)}
                          disabled={!plate}
                          title="Copy plate"
                        >
                          Copy
                        </button>

                        <button
                          type="button"
                          className="rounded-xl border border-gray-300 px-2.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                          onClick={() => toggleHistory(r.id, plate)}
                          disabled={loading}
                          title={isOpen ? "Hide history" : "View history"}
                        >
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable history */}
                  {isOpen && (
                    <div className="mt-3 rounded-xl border border-neutral-200 dark:border-gray-800 bg-white/60 dark:bg-gray-900/30 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold text-main">
                          Previous violations
                          {Array.isArray(history) ? (
                            <span className="text-muted font-normal"> • {history.length}</span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="text-xs font-semibold text-orange-600 hover:underline"
                          onClick={() => toggleHistory(r.id, plate)}
                        >
                          Hide
                        </button>
                      </div>

                      {histLoading ? (
                        <div className="mt-2 text-sm text-muted">Loading history…</div>
                      ) : histError ? (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 text-xs">
                          {histError}
                        </div>
                      ) : !history || history.length === 0 ? (
                        <div className="mt-2 text-sm text-muted">No previous violations found.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {history.map((v) => {
                            const status = norm(v.status) || "Unknown";
                            const street = norm(v.street_name) || "Unknown street";
                            const type = norm(v.violation_type) || "Violation";
                            const when = prettyDate(v.timestamp);

                            return (
                              <div
                                key={v.id}
                                className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${pillClassForStatus(
                                        status
                                      )}`}
                                    >
                                      {status}
                                    </span>
                                    <span className="text-[11px] text-muted truncate">{when}</span>
                                  </div>

                                  <div className="mt-1 text-sm text-main truncate">{type}</div>
                                  <div className="mt-0.5 text-xs text-sub truncate">{street}</div>
                                </div>

                                <button
                                  type="button"
                                  className="shrink-0 rounded-xl border border-gray-300 px-2.5 py-2 text-xs font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                                  onClick={() => nav(`/violation/${v.id}`)}
                                  title="Open violation"
                                >
                                  <span className="inline-flex items-center gap-1">
                                    <ExternalLink size={14} />
                                    Open
                                  </span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-2 text-[11px] text-muted">
                        Showing latest 30 (tap a row to open details).
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-6" />
    </div>
  );
}