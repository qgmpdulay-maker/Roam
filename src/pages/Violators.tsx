import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
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

  violator_image_url?: string | null;
  image_url?: string | null;
};

type LatestViolationMeta = {
  timestamp: string | null;
  street_name: string | null;
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

  const [plateToVehicle, setPlateToVehicle] = useState<Record<string, string>>({});
  const [violatorThumbs, setViolatorThumbs] = useState<Record<string, string>>({});
  const [latestMetaByViolator, setLatestMetaByViolator] = useState<Record<string, LatestViolationMeta>>({});

  const [q, setQ] = useState("");
  const [streetFilter, setStreetFilter] = useState<string>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [historyByViolator, setHistoryByViolator] = useState<Record<string, ViolationHistoryRow[]>>({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [historyErrorById, setHistoryErrorById] = useState<Record<string, string>>({});

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

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

        const plates = list.map((r) => norm(r.license_plate)).filter(Boolean);

        if (!cancelled) {
          const mapping = await fetchVehicleTypesForPlates(plates);
          if (!cancelled) setPlateToVehicle(mapping);
        }

        for (const r of list) {
          if (cancelled) break;
          if (!r?.id) continue;

          const plate = norm(r.license_plate);
          const meta = await fetchLatestViolationMetaForViolator(r.id, plate);
          if (cancelled) break;

          if (meta?.image) {
            setViolatorThumbs((prev) => ({ ...prev, [r.id]: meta.image }));
          }

          if (meta?.timestamp || meta?.street_name) {
            setLatestMetaByViolator((prev) => ({
              ...prev,
              [r.id]: { timestamp: meta.timestamp ?? null, street_name: meta.street_name ?? null },
            }));
          }
        }
      } catch (e: any) {
        console.error("Violators fetch error:", e);
        if (!cancelled) setRows([]);
        if (!cancelled) {
          setError(e?.message ?? `Failed to load ${VIOLATORS_TABLE}. Check table name and RLS.`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchViolators();
    return () => {
      cancelled = true;
    };
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

      if (error) continue;

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

  async function fetchLatestViolationMetaForViolator(violatorId: string, plate: string) {
    const cleanPlate = norm(plate);

    const { data, error } = await supabase
      .from(VIOLATIONS_TABLE)
      .select("violator_image_url,image_url,timestamp,street_name,license_plate,violator_id")
      .or(
        cleanPlate
          ? `violator_id.eq.${violatorId},license_plate.ilike.${cleanPlate}`
          : `violator_id.eq.${violatorId}`
      )
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return null;

    const row = data as any;

    return {
      image: row?.violator_image_url || row?.image_url || null,
      timestamp: (row?.timestamp ?? null) as string | null,
      street_name: (row?.street_name ?? null) as string | null,
    };
  }

  async function fetchViolationHistoryForViolator(violatorId: string, plate: string) {
    const q1 = supabase
      .from(VIOLATIONS_TABLE)
      .select("id,timestamp,status,street_name,violation_type,vehicle_class,license_plate,violator_id")
      .eq("violator_id", violatorId)
      .order("timestamp", { ascending: false })
      .limit(30);

    const { data: d1, error: e1 } = await q1;
    if (e1) throw e1;

    const list1 = (d1 ?? []) as ViolationHistoryRow[];
    if (list1.length > 0) return list1;

    const p = norm(plate);
    if (!p) return list1;

    const q2 = supabase
      .from(VIOLATIONS_TABLE)
      .select("id,timestamp,status,street_name,violation_type,vehicle_class,license_plate,violator_id")
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
      setHistoryByViolator((prev) => ({ ...prev, [violatorId]: [] }));
      setHistoryErrorById((prev) => ({
        ...prev,
        [violatorId]: e?.message ?? "Could not load violation history.",
      }));
    } finally {
      setHistoryLoadingId(null);
    }
  }

  const streetOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const street = norm(latestMetaByViolator[r.id]?.street_name);
      if (street) set.add(street);
    }
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows, latestMetaByViolator]);

  const filtered = useMemo(() => {
    const query = normLower(q);

    return rows.filter((r) => {
      const plate = normLower(r.license_plate);
      const name = normLower(r.full_name);

      const meta = latestMetaByViolator[r.id];
      const street = normLower(meta?.street_name);

      const matchStreet =
        streetFilter === "all" || normLower(streetFilter) === street;

      if (!query) return matchStreet;

      const iso = norm(meta?.timestamp);
      const yyyyMmDd = iso ? iso.slice(0, 10) : "";
      const pretty = iso ? prettyDate(iso) : "";

      const matchQuery =
        plate.includes(query) ||
        name.includes(query) ||
        street.includes(query) ||
        normLower(iso).includes(query) ||
        normLower(yyyyMmDd).includes(query) ||
        normLower(pretty).includes(query);

      return matchStreet && matchQuery;
    });
  }, [rows, q, streetFilter, latestMetaByViolator]);

  return (
    <div className="page space-y-4">
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[999] bg-black/70 p-4 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="absolute -top-3 -right-3 rounded-full bg-white p-2 shadow"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <img
              src={lightboxUrl}
              alt="Violator"
              className="w-full max-h-[80vh] object-contain rounded-2xl bg-black"
            />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Violators</h1>
          <p className="text-sm text-muted">
            {loading ? "Loading…" : `${filtered.length} result(s)`} • {rows.length} total
          </p>

          {error ? (
            <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
          <div className="md:col-span-2">
            <label className="roam-label">Search</label>
            <input
              className="roam-input mt-1"
              placeholder="Search plate, name, street, or date (e.g. 2026-02-24)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div>
            <label className="roam-label">Street</label>
            <select
              className="roam-input mt-1"
              value={streetFilter}
              onChange={(e) => setStreetFilter(e.target.value)}
            >
              {streetOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === "all" ? "All" : opt}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card p-2">
        {loading ? (
          <div className="p-4 text-sm text-muted">Loading violators…</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted">
            No violators found. Try another keyword or street.
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
              const meta = latestMetaByViolator[r.id];
              const latestStreet = norm(meta?.street_name);
              const latestWhen = prettyDate(meta?.timestamp);

              return (
                <div key={r.id ?? `${plate}-${idx}`} className="p-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="shrink-0 h-14 w-14 rounded-xl overflow-hidden border border-neutral-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800"
                      onClick={() => thumb && setLightboxUrl(thumb)}
                      disabled={!thumb}
                      title={thumb ? "View photo" : "No photo"}
                    >
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
                    </button>

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

                        <div className="mt-1 text-[11px] text-muted">
                          Latest violation: {latestWhen}
                          {latestStreet ? <span> • {latestStreet}</span> : null}
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
                          title={isOpen ? "Hide history" : "View history"}
                        >
                          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

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