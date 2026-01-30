import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ViolatorRow = {
  id: string;
  full_name: string | null;
  license_plate: string | null;
  address?: string | null;
  contact_no?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  // optional booleans
  has_driver_license?: boolean | null;
  has_orcr?: boolean | null;
  note?: string | null;
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function normLower(s: any) {
  return norm(s).toLowerCase();
}

function prettyDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

// chunk helper for Supabase IN(...) limits
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function Violators() {
  const [rows, setRows] = useState<ViolatorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // plate -> vehicle_type (from violations table)
  const [plateToVehicle, setPlateToVehicle] = useState<Record<string, string>>(
    {}
  );

  // Search + filter
  const [q, setQ] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");

  // ✅ IMPORTANT: ensure these match your DB
  const VIOLATORS_TABLE = "violators";
  const VIOLATIONS_TABLE = "violations";
  const VIOLATIONS_PLATE_COL = "license_plate"; // change if your violations uses different column
  const VIOLATIONS_VEHICLE_COL = "vehicle_class"; // change if needed
  const VIOLATIONS_TIME_COL = "timestamp"; // change if you want resolved_at, created_at, etc.

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
        const plates = list
          .map((r) => norm(r.license_plate))
          .filter(Boolean);

        if (!cancelled) {
          const mapping = await fetchVehicleTypesForPlates(plates);
          if (!cancelled) setPlateToVehicle(mapping);
        }
      } catch (e: any) {
        console.error("Violators fetch error:", e);
        if (!cancelled) setRows([]);
        if (!cancelled)
          setError(
            e?.message ??
              `Failed to load ${VIOLATORS_TABLE}. Check table name and RLS.`
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
    // If no plates, nothing to do
    if (!plates.length) return {};

    // Supabase IN(...) works best in chunks
    const mapping: Record<string, { vehicle: string; time: number }> = {};
    const plateChunks = chunk(plates, 100);

    for (const part of plateChunks) {
      // Pull latest violations rows per plate (we'll reduce client-side)
      // Note: if your violations column names differ, change constants above.
      const { data, error } = await supabase
        .from(VIOLATIONS_TABLE)
        .select(
          `${VIOLATIONS_PLATE_COL},${VIOLATIONS_VEHICLE_COL},${VIOLATIONS_TIME_COL}`
        )
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

        // Keep the latest entry for that plate
        if (!mapping[plate] || time >= mapping[plate].time) {
          mapping[plate] = { vehicle, time };
        }
      }
    }

    // flatten to plate -> vehicle
    const out: Record<string, string> = {};
    for (const plate of Object.keys(mapping)) out[plate] = mapping[plate].vehicle;
    return out;
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

      const matchQuery =
        !query || plate.includes(query) || name.includes(query);

      const matchVehicle =
        vehicleFilter === "all" ||
        normLower(vehicleFilter) === vt;

      return matchQuery && matchVehicle;
    });
  }, [rows, q, vehicleFilter, plateToVehicle]);

  return (
    <div className="page space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Violators</h1>
          <p className="text-sm text-muted">
            {loading ? "Loading…" : `${filtered.length} result(s)`} •{" "}
            {rows.length} total
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          <div className="font-semibold">Couldn’t load violators</div>
          <div className="mt-1">{error}</div>
          <div className="mt-2 text-[12px] text-red-600/90">
            If it says “permission denied” / “RLS”, you need a SELECT policy for
            authenticated users on <b>{VIOLATORS_TABLE}</b> (and maybe{" "}
            <b>{VIOLATIONS_TABLE}</b> too).
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

              return (
                <div key={r.id ?? `${plate}-${idx}`} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold text-main truncate">
                          {plate || "— Plate —"}
                        </div>

                        {/* ✅ vehicle type now comes from violations table */}
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

                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                        onClick={() => navigator.clipboard?.writeText(plate)}
                        disabled={!plate}
                        title="Copy plate"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
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