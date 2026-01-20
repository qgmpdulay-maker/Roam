import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

// --- Types -------------------------------------------------------------------
type Violation = {
  id: string;
  timestamp: string | null;
  vehicle_class: string | null;
  status: string | null;

  // NEW (for "My Resolved" charts)
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

function colorForClass(c?: string) {
  const key = (c || "").toLowerCase();
  return VEHICLE_COLORS[key] ?? "#9CA3AF";
}

function daysAgoUTC(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
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

// Range options
type RangeKey = "all" | "year" | "month" | "week";

const RANGE_OPTIONS: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "all", label: "All time", days: null },
  { key: "year", label: "1 year", days: 365 },
  { key: "month", label: "30 days", days: 30 },
  { key: "week", label: "7 days", days: 7 },
];

// --- Component ---------------------------------------------------------------
export default function Statistics() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [range, setRange] = useState<RangeKey>("month");
  const [loading, setLoading] = useState(false);

  // NEW: officer-only resolved data (top section)
  const [myResolved, setMyResolved] = useState<Violation[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const selected = useMemo(
    () => RANGE_OPTIONS.find((r) => r.key === range)!,
    [range]
  );

  // Fetch ALL violations (existing behavior)
  useEffect(() => {
    let cancelled = false;

    async function fetchAllViolationsPaginated() {
      const pageSize = 1000; // Supabase typical max per page
      let from = 0;
      let all: Violation[] = [];

      while (true) {
        const to = from + pageSize - 1;

        const { data, error } = await supabase
          .from("violations")
          .select("id,timestamp,vehicle_class,status")
          .order("timestamp", { ascending: true })
          .range(from, to);

        if (error) throw error;

        const batch = (data ?? []) as Violation[];
        all = all.concat(batch);

        if (batch.length < pageSize) break;
        from += pageSize;
      }

      return all;
    }

    async function fetchWindowed(days: number) {
      const since = daysAgoUTC(days);
      const { data, error } = await supabase
        .from("violations")
        .select("id,timestamp,vehicle_class,status")
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Violation[];
    }

    (async () => {
      try {
        setLoading(true);

        const rows =
          selected.days === null
            ? await fetchAllViolationsPaginated()
            : await fetchWindowed(selected.days);

        if (!cancelled) setViolations(rows);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected.days]);

  // NEW: Fetch ONLY this officer's RESOLVED violations (top section)
  useEffect(() => {
    let cancelled = false;

    async function fetchMyResolved(days: number | null) {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user;

      if (authErr || !user) return [];

      // All time (paginated)
      if (days === null) {
        const pageSize = 1000;
        let from = 0;
        let all: Violation[] = [];

        while (true) {
          const to = from + pageSize - 1;

          const { data, error } = await supabase
            .from("violations")
            .select("id,resolved_at,resolved_by,vehicle_class,status,timestamp")
            .eq("resolved_by", user.id)
            .eq("status", "resolved")
            .order("resolved_at", { ascending: true })
            .range(from, to);

          if (error) throw error;

          const batch = (data ?? []) as Violation[];
          all = all.concat(batch);

          if (batch.length < pageSize) break;
          from += pageSize;
        }

        return all;
      }

      // Windowed (by resolved_at)
      const since = daysAgoUTC(days);

      const { data, error } = await supabase
        .from("violations")
        .select("id,resolved_at,resolved_by,vehicle_class,status,timestamp")
        .eq("resolved_by", user.id)
        .eq("status", "resolved")
        .gte("resolved_at", since)
        .order("resolved_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as Violation[];
    }

    (async () => {
      try {
        setMyLoading(true);
        const rows = await fetchMyResolved(selected.days);
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
  }, [selected.days]);

  // --- Vehicle Class Distribution (Donut) ------------------------------------
  const classCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      const key = (v.vehicle_class || "").toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const c of VEHICLE_ORDER) if (!map.has(c)) map.set(c, 0);

    return Array.from(map.entries()).map(([k, count]) => ({
      name: k.replace(/\b\w/g, (s) => s.toUpperCase()),
      count,
      fill: colorForClass(k),
    }));
  }, [violations]);

  // --- Status Distribution (Pie) ---------------------------------------------
  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations) {
      const key = v.status ?? "Unknown";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
    }));
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

  // ===================== NEW TOP CHARTS (MY RESOLVED) =========================
  const myResolvedByVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of myResolved) {
      const key = (v.vehicle_class || "").toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    for (const c of VEHICLE_ORDER) if (!map.has(c)) map.set(c, 0);

    return Array.from(map.entries()).map(([k, count]) => ({
      name: k.replace(/\b\w/g, (s) => s.toUpperCase()),
      count,
      fill: colorForClass(k),
    }));
  }, [myResolved]);

  const myResolvedTrend = useMemo(() => {
    const days = selected.days; // null = all time
    const map = new Map<string, number>();

    for (const v of myResolved) {
      const t = v.resolved_at ?? null;
      if (!t) continue;
      const d = new Date(t);
      if (isNaN(d.getTime())) continue;

      // all-time => group by month; windowed => group by day
      const key =
        days === null
          ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
          : d.toISOString().slice(0, 10);

      map.set(key, (map.get(key) ?? 0) + 1);
    }

    const rows = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({
        label: days === null ? key : key.slice(5), // YYYY-MM or MM-DD
        count,
      }));

    // Keep it readable
    return days === null ? rows.slice(-12) : rows.slice(-30);
  }, [myResolved, selected.days]);

  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen px-4 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Statistics</h1>
          <p className="text-sm text-gray-500">
            {loading ? "Loading…" : `${violations.length} records`} •{" "}
            {selected.label}
          </p>
        </div>

        {/* Range Filter */}
        <div className="flex gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`px-3 py-1 rounded-full text-sm border ${
                range === opt.key
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-900"
              }`}
              onClick={() => setRange(opt.key)}
              disabled={loading || myLoading}
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

{/* ===================== MY RESOLVED (NEW TOP SECTION) ===================== */}
<div className="rounded-2xl border border-gray-200 bg-white p-4">
  <div className="flex items-start justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">My Resolved Summary</h2>
      <p className="text-xs text-gray-500">
        {myLoading ? "Loading…" : `${myResolved.length} resolved`} •{" "}
        {selected.label}
      </p>
    </div>

    <div className="text-right">
      <div className="text-xs text-gray-500">Total Resolved</div>
      <div className="text-2xl font-bold">{myResolved.length}</div>
    </div>
  </div>

  {/* Two cards like your other sections */}
  <div className="mt-4 grid gap-4 md:grid-cols-2">
    {/* Donut */}
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold mb-3">Resolved Violations by Vehicle Type</h3>

      {myResolved.length === 0 ? (
        <div className="h-[260px] grid place-items-center text-sm text-gray-500">
          No resolved data in this range.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-2 items-center">
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={myResolvedByVehicle.filter(d => d.count > 0)}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={105}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {myResolvedByVehicle
                    .filter(d => d.count > 0)
                    .map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Custom legend (clean + compact) */}
          <div className="max-h-[240px] overflow-auto pr-1">
            <div className="space-y-2">
              {myResolvedByVehicle
                .filter(d => d.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((d) => (
                  <div key={d.name} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: d.fill }}
                      />
                      <span className="text-xs text-gray-700 truncate">{d.name}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900">{d.count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Trend */}
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold mb-3">Violations Resolved Trend</h3>

      {myResolvedTrend.length === 0 ? (
        <div className="h-[260px] grid place-items-center text-sm text-gray-500">
          No trend data yet.
        </div>
      ) : (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={myResolvedTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#10B981" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 text-[11px] text-gray-500">
        {selected.days === null
          ? "Grouped by month (last 12 shown)."
          : "Grouped by day (last 30 shown)."}
      </div>
    </div>
  </div>
</div>
{/* =================== END MY RESOLVED (NEW TOP SECTION) =================== */}

      {/* Vehicle Class Distribution */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">
          Vehicle Class Distribution
        </h2>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={classCounts}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                label
              >
                {classCounts.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Violation Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">Violation Status</h2>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={statusData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {statusData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={["#F59E0B", "#10B981", "#EF4444", "#6B7280"][i % 4]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Heatmap (Day × Hour) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Heatmap (Day × Hour)</h2>
          <div className="text-xs text-gray-500">{selected.label}</div>
        </div>

        <div className="grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-1 mb-1 text-[10px] text-gray-500">
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
              <div className="text-xs text-gray-700">{label}</div>
              {Array.from({ length: 24 }).map((_, hr) => {
                const count = heatData.mat[dow][hr];
                const col = heatData.max
                  ? heatColor(count / heatData.max)
                  : heatColor(0);
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

        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span>Low</span>
          <div
            className="h-3 w-20 rounded"
            style={{
              background: `linear-gradient(to right, ${heatColor(
                0
              )}, ${heatColor(1)})`,
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