import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

// --- Types -------------------------------------------------------------------
type Violation = {
  id: string;
  timestamp: string | null;
  vehicle_class: string | null;
  status: string | null;

  // ✅ Street column in your DB is commonly "street_name"
  street_name?: string | null;

  // for "My Resolved" charts
  resolved_by?: string | null;
  resolved_at?: string | null;
};

// --- Helpers -----------------------------------------------------------------
const VEHICLE_ORDER = [
  "motorcycle",
  "pickup truck",
  "sedan",
  "suv",
  "tricycle",
  "truck",
  "uv",
  "van",
] as const;

const VEHICLE_COLORS: Record<string, string> = {
  motorcycle: "#7C3AED",
  "pickup truck": "#DB2777",
  sedan: "#EF4444",
  suv: "#34D399",
  tricycle: "#EA580C",
  truck: "#60A5FA",
  uv: "#FACC15",
  van: "#2563EB",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  resolved: "#10B981",
  unknown: "#9CA3AF",
};

function colorForClass(c?: string) {
  const key = (c || "").toLowerCase();
  return VEHICLE_COLORS[key] ?? "#9CA3AF";
}

function colorForStatus(s?: string) {
  const key = (s || "unknown").toLowerCase();
  return STATUS_COLORS[key] ?? "#9CA3AF";
}

function toLocal(dateISO: string | null) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  return isNaN(d.getTime()) ? null : d;
}

// Heatmap color scale
function heatColor(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const c0 = [255, 247, 237];
  const c1 = [234, 88, 12];
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * x);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * x);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * x);
  return `rgb(${r}, ${g}, ${b})`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtRangeLabel(startISO: string | null, endISO: string | null) {
  if (!startISO || !endISO) return "All time";
  const s = new Date(startISO);
  const e = new Date(endISO);
  const ok = !isNaN(s.getTime()) && !isNaN(e.getTime());
  if (!ok) return "All time";
  return `${s.toLocaleDateString()} – ${e.toLocaleDateString()}`;
}

function dateToStartISO(yyyy_mm_dd: string) {
  const d = new Date(`${yyyy_mm_dd}T00:00:00`);
  return d.toISOString();
}

function dateToEndISO(yyyy_mm_dd: string) {
  const d = new Date(`${yyyy_mm_dd}T23:59:59.999`);
  return d.toISOString();
}

function daysBetween(startISO: string, endISO: string) {
  const s = new Date(startISO).getTime();
  const e = new Date(endISO).getTime();
  if (isNaN(s) || isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));
}

// --- Component ---------------------------------------------------------------
export default function Statistics() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(false);

  // officer-only resolved data (top section)
  const [myResolved, setMyResolved] = useState<Violation[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  // Date filter UI (yyyy-mm-dd)
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [appliedStartISO, setAppliedStartISO] = useState<string | null>(null);
  const [appliedEndISO, setAppliedEndISO] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string>("");

  // default: last 30 days
  useEffect(() => {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const start = d.toISOString().slice(0, 10);

    setStartDate(start);
    setEndDate(end);

    setAppliedStartISO(dateToStartISO(start));
    setAppliedEndISO(dateToEndISO(end));
  }, []);

  function onApplyDates() {
    setDateError("");

    if (!startDate || !endDate) {
      setAppliedStartISO(null);
      setAppliedEndISO(null);
      return;
    }

    if (startDate > endDate) {
      setDateError("Start date must be before end date.");
      return;
    }

    setAppliedStartISO(dateToStartISO(startDate));
    setAppliedEndISO(dateToEndISO(endDate));
  }

  function onClearDates() {
    setDateError("");
    setStartDate("");
    setEndDate("");
    setAppliedStartISO(null);
    setAppliedEndISO(null);
  }

  const rangeLabel = useMemo(
    () => fmtRangeLabel(appliedStartISO, appliedEndISO),
    [appliedStartISO, appliedEndISO]
  );

  // Fetch ALL violations (filtered by timestamp, paginated)
  useEffect(() => {
    let cancelled = false;

    async function fetchAllViolationsPaginated(
      startISO: string | null,
      endISO: string | null
    ) {
      const pageSize = 1000;
      let from = 0;
      let all: Violation[] = [];

      while (true) {
        const to = from + pageSize - 1;

        let q = supabase
          .from("violations")
          .select("id,timestamp,vehicle_class,status,street_name")
          .order("timestamp", { ascending: true })
          .range(from, to);

        if (startISO) q = q.gte("timestamp", startISO);
        if (endISO) q = q.lte("timestamp", endISO);

        const { data, error } = await q;
        if (error) throw error;

        const batch = (data ?? []) as Violation[];
        all = all.concat(batch);

        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return all;
    }

    (async () => {
      try {
        setLoading(true);
        const rows = await fetchAllViolationsPaginated(appliedStartISO, appliedEndISO);
        if (!cancelled) setViolations(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setViolations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedStartISO, appliedEndISO]);

  // Fetch ONLY this officer's RESOLVED violations (filtered by resolved_at)
  useEffect(() => {
    let cancelled = false;

    async function fetchMyResolvedPaginated(
      startISO: string | null,
      endISO: string | null
    ) {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user;
      if (authErr || !user) return [];

      const pageSize = 1000;
      let from = 0;
      let all: Violation[] = [];

      while (true) {
        const to = from + pageSize - 1;

        let q = supabase
          .from("violations")
          .select("id,resolved_at,resolved_by,vehicle_class,status,timestamp,street_name")
          .eq("resolved_by", user.id)
          .eq("status", "resolved")
          .order("resolved_at", { ascending: true })
          .range(from, to);

        if (startISO) q = q.gte("resolved_at", startISO);
        if (endISO) q = q.lte("resolved_at", endISO);

        const { data, error } = await q;
        if (error) throw error;

        const batch = (data ?? []) as Violation[];
        all = all.concat(batch);

        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return all;
    }

    (async () => {
      try {
        setMyLoading(true);
        const rows = await fetchMyResolvedPaginated(appliedStartISO, appliedEndISO);
        if (!cancelled) setMyResolved(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setMyResolved([]);
      } finally {
        if (!cancelled) setMyLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedStartISO, appliedEndISO]);

  // --- Vehicle Class Distribution (BAR DATA) ---------------------------------
  const classCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      const key = (v.vehicle_class || "").toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const c of VEHICLE_ORDER) if (!map.has(c)) map.set(c, 0);

    return VEHICLE_ORDER.map((k) => ({
      name: k.replace(/\b\w/g, (s) => s.toUpperCase()),
      key: k,
      count: map.get(k) ?? 0,
      fill: colorForClass(k),
    }));
  }, [violations]);

  // --- Status Distribution (BAR DATA) ----------------------------------------
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      const key = (v.status ?? "Unknown").toLowerCase();
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const items = Array.from(map.entries()).map(([k, value]) => ({
      name: k.replace(/\b\w/g, (s) => s.toUpperCase()),
      key: k,
      value,
      fill: colorForStatus(k),
    }));

    items.sort((a, b) => b.value - a.value);
    return items;
  }, [violations]);

  // --- Violations by Street (TOP 10) -----------------------------------------
  const violationsByStreet = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      const street = (v.street_name || "").trim() || "Unknown street";
      map.set(street, (map.get(street) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [violations]);

  // --- Heatmap (Day × Hour) ---------------------------------------------------
  const heatData = useMemo(() => {
    const mat = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;

    for (const v of violations) {
      const d = toLocal(v.timestamp);
      if (!d) continue;
      const dow = d.getDay();
      const hr = d.getHours();
      const c = ++mat[dow][hr];
      if (c > max) max = c;
    }
    return { mat, max };
  }, [violations]);

  // ===================== MY RESOLVED (TOP CHARTS) =========================
  const myResolvedByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of myResolved) {
      const key = (v.vehicle_class || "").toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const c of VEHICLE_ORDER) if (!map.has(c)) map.set(c, 0);

    return VEHICLE_ORDER.map((k) => ({
      name: k.replace(/\b\w/g, (s) => s.toUpperCase()),
      key: k,
      count: map.get(k) ?? 0,
      fill: colorForClass(k),
    }));
  }, [myResolved]);

  const myResolvedTrend = useMemo(() => {
    const map = new Map<string, number>();

    for (const v of myResolved) {
      const t = v.resolved_at ?? null;
      if (!t) continue;
      const d = new Date(t);
      if (isNaN(d.getTime())) continue;

      const shouldMonth =
        appliedStartISO && appliedEndISO
          ? daysBetween(appliedStartISO, appliedEndISO) > 60
          : true;

      const key = shouldMonth
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        : d.toISOString().slice(0, 10);

      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({
        label: key.length === 10 ? key.slice(5) : key, // MM-DD or YYYY-MM
        count,
      }))
      .slice(-30);
  }, [myResolved, appliedStartISO, appliedEndISO]);

  const trendModeLabel =
    appliedStartISO && appliedEndISO && daysBetween(appliedStartISO, appliedEndISO) > 60
      ? "Grouped by month (last shown)."
      : "Grouped by day (last shown).";

  // ---------------------------------------------------------------------------

  return (
    <div className="page space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Statistics</h1>
          <p className="text-sm text-muted">
            {loading ? "Loading…" : `${violations.length} records`} • {rangeLabel}
          </p>
        </div>
      </div>

       {/* Date range card */}
      <div className="card p-4">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold text-main">Date range</div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:items-end">
            <div>
              <label className="roam-label">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="roam-input mt-1"
              />
            </div>

            <div>
              <label className="roam-label">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="roam-input mt-1"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onApplyDates}
                className="w-full rounded-2xl bg-orange-600 py-3 text-white font-semibold hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50"
                disabled={loading || myLoading}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={onClearDates}
                className="w-full rounded-2xl border border-gray-300 py-3 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                disabled={loading || myLoading}
              >
                Clear
              </button>
            </div>
          </div>

          {dateError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
              {dateError}
            </div>
          )}
        </div>
      </div>


      {/* ===================== MY RESOLVED (TOP SECTION) ===================== */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-main">My Resolved Summary</h2>
            <p className="text-xs text-muted">
              {myLoading ? "Loading…" : `${myResolved.length} resolved`} • {rangeLabel}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Total Resolved</div>
            <div className="text-2xl font-bold text-main tabular-nums">{myResolved.length}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Resolved by vehicle (BIG chart, smaller legend) */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3 text-main">
              Resolved Violations by Vehicle Type
            </h3>

            {myResolved.length === 0 ? (
              <div className="h-[360px] grid place-items-center text-sm text-muted">
                No resolved data in this range.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_170px] gap-3 items-center">
                <div style={{ width: "100%", height: 360 }}>
                  <ResponsiveContainer>
                    <BarChart data={myResolvedByVehicle.filter((d) => d.count > 0)}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                      <XAxis tick={false} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[10, 10, 0, 0]} isAnimationActive={false}>
                        {myResolvedByVehicle
                          .filter((d) => d.count > 0)
                          .map((d, i) => (
                            <Cell key={i} fill={d.fill} />
                          ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="max-h-[320px] overflow-auto pr-1">
                  <div className="text-[11px] font-semibold text-main mb-2">Legend</div>
                  <div className="space-y-2">
                    {myResolvedByVehicle
                      .filter((d) => d.count > 0)
                      .sort((a, b) => b.count - a.count)
                      .map((d) => (
                        <div key={d.key} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-block h-3 w-3 rounded-sm"
                              style={{ backgroundColor: d.fill }}
                            />
                            <span className="text-[11px] text-sub truncate">{d.name}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-main tabular-nums">
                            {d.count}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trend */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold mb-3 text-main">
              Violations Resolved Trend
            </h3>

            {myResolvedTrend.length === 0 ? (
              <div className="h-[360px] grid place-items-center text-sm text-muted">
                Not enough data to show a trend yet.
              </div>
            ) : (
              <div style={{ width: "100%", height: 360 }}>
                <ResponsiveContainer>
                  <BarChart data={myResolvedTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                    {/* ✅ hide labels (no ugly x labels) */}
                    <XAxis tick={false} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#10B981" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="mt-2 text-[11px] text-muted">{trendModeLabel}</div>
          </div>
        </div>
      </div>

      {/* Vehicle Class Distribution (BIG chart, smaller legend) */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Vehicle Class Distribution</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
          <div style={{ width: "100%", height: 380 }}>
            <ResponsiveContainer>
              <BarChart data={classCounts.filter((d) => d.count > 0)}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis tick={false} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} isAnimationActive={false}>
                  {classCounts
                    .filter((d) => d.count > 0)
                    .map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[340px] overflow-auto pr-1">
            <div className="text-[11px] font-semibold text-main mb-2">Legend</div>
            <div className="space-y-2">
              {classCounts
                .filter((d) => d.count > 0)
                .slice()
                .sort((a, b) => b.count - a.count)
                .map((d) => (
                  <div key={d.key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ backgroundColor: d.fill }}
                      />
                      <span className="text-[11px] text-sub truncate">{d.name}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-main tabular-nums">{d.count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Violation Status (change bar colors per status + bigger chart) */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Violation Status</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis tick={false} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[10, 10, 0, 0]} isAnimationActive={false}>
                  {statusData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[300px] overflow-auto pr-1">
            <div className="text-[11px] font-semibold text-main mb-2">Legend</div>
            <div className="space-y-2">
              {statusData.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: d.fill }}
                    />
                    <span className="text-[11px] text-sub truncate">{d.name}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-main tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Violations by Street */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Violations by Street</h2>

        {violationsByStreet.length === 0 ? (
          <div className="h-[380px] grid place-items-center text-sm text-muted">
            No street data available for this range.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <BarChart
                  data={violationsByStreet}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={110}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#F97316" radius={[0, 10, 10, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="max-h-[340px] overflow-auto pr-1">
              <div className="text-[11px] font-semibold text-main mb-2">Top streets</div>
              <div className="space-y-2">
                {violationsByStreet.map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-sub truncate">{d.name}</span>
                    <span className="text-[11px] font-semibold text-main tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Heatmap (Day × Hour) */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-main">Heatmap (Day × Hour)</h2>
          <div className="text-xs text-muted">{rangeLabel}</div>
        </div>

        <div className="grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-1 mb-1 text-[10px] text-muted">
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="text-center">
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>

        <div className="grid gap-1">
          {DOW.map((label, dow) => (
            <div
              key={label}
              className="grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-1 items-center"
            >
              <div className="text-xs text-sub">{label}</div>
              {Array.from({ length: 24 }).map((_, hr) => {
                const count = heatData.mat[dow][hr];
                const col = heatData.max ? heatColor(count / heatData.max) : heatColor(0);
                return (
                  <div
                    key={`${dow}-${hr}`}
                    className="h-4 rounded"
                    style={{ backgroundColor: count ? col : "#F3F4F6" }}
                    title={`${label} ${String(hr).padStart(2, "0")}:00 — ${count} violation${
                      count === 1 ? "" : "s"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span>Low</span>
          <div
            className="h-3 w-20 rounded"
            style={{
              background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(1)})`,
            }}
          />
          <span>High</span>
          <span className="ml-auto">Peak: {heatData.max}</span>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}