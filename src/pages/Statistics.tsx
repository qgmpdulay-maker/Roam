// src/pages/Statistics.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from "recharts";

// --- Types -------------------------------------------------------------------
type Violation = {
  id: string;
  timestamp: string | null;
  vehicle_class: string | null;
  status: string | null;
};

// --- Helpers -----------------------------------------------------------------
const VEHICLE_ORDER = [
  "motorcycle", "pickup truck", "sedan", "suv", "tricycle", "truck", "uv", "van",
] as const;

const VEHICLE_COLORS: Record<string, string> = {
  "motorcycle": "#7C3AED",
  "pickup truck": "#DB2777",
  "sedan":        "#EF4444",
  "suv":          "#34D399",
  "tricycle":     "#EA580C",
  "truck":        "#60A5FA",
  "uv":           "#FACC15",
  "van":          "#2563EB",
};

function colorForClass(c?: string) {
  const key = (c || "").toLowerCase();
  return VEHICLE_COLORS[key] ?? "#9ca3af";
}
function daysAgoUTC(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function fmtShort(dateISO: string) {
  const d = new Date(dateISO);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toLocal(dateISO: string | null) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  return isNaN(d.getTime()) ? null : d;
}

// Nice orange scale 0..1 -> color
function heatColor(t: number) {
  // clamp
  const x = Math.max(0, Math.min(1, t));
  // very light -> deep orange
  // interpolate between #FFF7ED (0) and #EA580C (1)
  const c0 = [255, 247, 237];
  const c1 = [234, 88, 12];
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * x);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * x);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * x);
  return `rgb(${r}, ${g}, ${b})`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // display order

// --- Component ---------------------------------------------------------------
export default function Statistics() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [daysWindow, setDaysWindow] = useState<7 | 30>(30);

  // fetch
  useEffect(() => {
    (async () => {
      const since = daysAgoUTC(60); // fetch a bit more; we’ll window client-side
      const { data, error } = await supabase
        .from("violations")
        .select("id,timestamp,vehicle_class,status")
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });
      if (!error && data) setViolations(data as Violation[]);
      else console.error(error);
    })();
  }, []);

  // windowed data
  const sinceISO = useMemo(() => daysAgoUTC(daysWindow), [daysWindow]);

  const windowed = useMemo(
    () => violations.filter(v => (v.timestamp ?? "") >= sinceISO),
    [violations, sinceISO]
  );

  // --- Top Vehicle Classes (bar, horizontal) ---------------------------------
  const classCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of windowed) {
      const key = (v.vehicle_class || "").toLowerCase();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    // Ensure all classes appear
    for (const c of VEHICLE_ORDER) if (!map.has(c)) map.set(c, 0);
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, count]) => ({ name: k.replace(/\b\w/g, s => s.toUpperCase()), count, fill: colorForClass(k) }));
  }, [windowed]);

  // --- Violations per day (line) ---------------------------------------------
  const perDay = useMemo(() => {
    // build date buckets for window
    const map = new Map<string, number>();
    const start = new Date(sinceISO);
    const now = new Date();
    // init buckets
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      const iso = new Date(d).toISOString();
      map.set(iso.slice(0, 10), 0);
    }
    // count
    for (const v of windowed) {
      const t = v.timestamp;
      if (!t) continue;
      const dayKey = t.slice(0, 10);
      if (map.has(dayKey)) map.set(dayKey, (map.get(dayKey) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([day, count]) => ({ day: fmtShort(day), count }));
  }, [windowed, sinceISO]);

  // --- Heatmap (Day × Hour) ---------------------------------------------------
  const heatData = useMemo(() => {
    // matrix[7][24] counts
    const mat = Array.from({ length: 7 }, () => Array(24).fill(0));
    let max = 0;
    for (const v of windowed) {
      const d = toLocal(v.timestamp);
      if (!d) continue;
      const dow = d.getDay();   // 0..6
      const hr  = d.getHours(); // 0..23
      const c = ++mat[dow][hr];
      if (c > max) max = c;
    }
    return { mat, max };
  }, [windowed]);

  return (
    <div className="min-h-screen px-4 py-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Statistics</h1>
        <p className="text-sm text-gray-500">{violations.length} total records</p>
      </div>

      {/* Top Vehicle Classes */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="text-lg font-semibold mb-3">Top Vehicle Classes</h2>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart
              layout="vertical"
              data={classCounts}
              margin={{ left: 5, right: 30, top: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="name" width={80} />
              <Tooltip />
              <Bar dataKey="count" isAnimationActive={false}>
                {classCounts.map((entry, i) => (
                  // @ts-ignore
                  <cell key={`c-${i}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Violations Per Day */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Violations Per Day ({daysWindow} days)</h2>
          <div className="flex gap-2">
            <button
              className={`px-3 py-1 rounded-full text-sm border ${daysWindow === 7 ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setDaysWindow(7)}
            >
              7 days
            </button>
            <button
              className={`px-3 py-1 rounded-full text-sm border ${daysWindow === 30 ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setDaysWindow(30)}
            >
              30 days
            </button>
          </div>
        </div>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={perDay} margin={{ left: 8, right: 16, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#EA580C" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* NEW: Heatmap (Day × Hour) */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Heatmap (Day × Hour)</h2>
          <div className="text-xs text-gray-500">{daysWindow}-day window</div>
        </div>

        {/* Hour header */}
        <div className="grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-1 mb-1 text-[10px] text-gray-500">
          <div />
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={`h${h}`} className="text-center">{h % 3 === 0 ? h : ""}</div>
          ))}
        </div>

        {/* Rows */}
        <div className="grid gap-1">
          {DOW.map((label, dow) => (
            <div
              key={label}
              className="grid grid-cols-[64px_repeat(24,minmax(0,1fr))] gap-1 items-center"
            >
              <div className="text-xs text-gray-700">{label}</div>
              {Array.from({ length: 24 }).map((_, hr) => {
                const count = heatData.mat[dow][hr];
                const col = heatData.max ? heatColor(count / heatData.max) : heatColor(0);
                return (
                  <div
                    key={`${dow}-${hr}`}
                    className="h-4 rounded"
                    style={{ backgroundColor: count ? col : "#F3F4F6" }}
                    title={`${label} ${String(hr).padStart(2, "0")}:00 — ${count} violation${count === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span>Low</span>
          <div className="h-3 w-20 rounded" style={{ background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(1)})` }} />
          <span>High</span>
          <span className="ml-auto">Peak: {heatData.max}</span>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}
