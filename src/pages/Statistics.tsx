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
  PieChart,
  Pie,
  LineChart,
  Line,
  Legend,
} from "recharts";

import { MapContainer, TileLayer, Polygon, Popup, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Types
type Violation = {
  id: string;
  timestamp: string | null;
  vehicle_class: string | null;
  status: string | null;
  street_name?: string | null;
  zone_id?: string | null;
  zone_name?: string | null;
};

type ZonePolygon = {
  id: string;
  name: string;
  polygon: [number, number][];
  isActive: boolean;
  baseColor?: string | null;
};

// Site anchor
const SITE_CENTER: LatLngExpression = [7.08029007530404, 125.62265921360454];

// Real GPS street polygons (Leaflet expects [lat, lng])
const STREET_ZONES: ZonePolygon[] = [
  {
    id: "bangoy_soliman",
    name: "F. Bangoy St. & Soliman St.",
    polygon: [
      [7.080623514750944, 125.62246974624841],
      [7.080486958164622, 125.62256776695564],
      [7.080341048342794, 125.62265824760848],
      [7.080262481496537, 125.62256965196926],
      [7.080419615175669, 125.62249425142522],
      [7.080558042420086, 125.6224018857588],
    ],
    baseColor: null,
    isActive: true,
  },
  {
    id: "soliman",
    name: "Soliman St.",
    polygon: [
      [7.080236462399354, 125.62257361669957],
      [7.080169860062925, 125.62259111568122],
      [7.080143242500169, 125.62255758806928],
      [7.080008976485793, 125.62239053693601],
      [7.080054328684146, 125.62234479607582],
      [7.080169049279386, 125.62248423364342],
    ],
    isActive: true,
  },
];

// Helpers
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
  const key = (c || "").toLowerCase().trim();
  return VEHICLE_COLORS[key] ?? "#9CA3AF";
}

function colorForStatus(s?: string) {
  const key = (s || "unknown").toLowerCase().trim();
  return STATUS_COLORS[key] ?? "#9CA3AF";
}

function heatColor(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const c0 = [255, 237, 213];
  const c1 = [234, 88, 12];
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * x);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * x);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * x);
  return `rgb(${r}, ${g}, ${b})`;
}

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

function normalize(s?: string | null) {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function formatHourLabel(h: number) {
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${hour12} ${ampm}`;
}

function getManilaHour(tsISO: string): number | null {
  const dt = new Date(tsISO);
  if (isNaN(dt.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(dt);

  const hh = parts.find((p) => p.type === "hour")?.value;
  const h = hh ? Number(hh) : NaN;
  return Number.isFinite(h) ? h : null;
}

// Manila date (YYYY-MM-DD) reliably
function getManilaYMD() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}-${m}-${d}`;
}

// Manila full day
function manilaDayToUTCISORange(yyyy_mm_dd: string) {
  const startISO = new Date(`${yyyy_mm_dd}T00:00:00+08:00`).toISOString();
  const endISO = new Date(`${yyyy_mm_dd}T23:59:59.999+08:00`).toISOString();
  return { startISO, endISO };
}

// 8 hours/day window (Manila)
const WINDOW_START_HOUR = 10; 
const WINDOW_END_HOUR = 18; 
const WINDOW_LABEL = `${formatHourLabel(WINDOW_START_HOUR)} – ${formatHourLabel(WINDOW_END_HOUR)}`;

function isWithinManilaWindow(tsISO: string) {
  const h = getManilaHour(tsISO);
  if (h === null) return false;
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}

// Map helpers
function MapFitBounds({ bounds }: { bounds: LatLngBoundsExpression | null }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds, { padding: [22, 22] });
    } catch (e) {
      console.error("fitBounds failed:", e);
    }
  }, [bounds, map]);

  return null;
}

// Chart tuning
const X_AXIS_PAD = { left: 26, right: 26 };
const Y_AXIS_WIDTH = 36;
const BAR_SIZE = 38;
const MAX_BAR_SIZE = 52;
const BAR_CATEGORY_GAP = "16%";
const BAR_GAP = 8;

const X_AXIS_COMMON = {
  tick: false,
  axisLine: false,
  tickLine: false,
  padding: X_AXIS_PAD,
};

const Y_AXIS_COMMON = {
  allowDecimals: false,
  width: Y_AXIS_WIDTH,
};

// Component
export default function Statistics() {
  // Charts data (default: last 30 days)
  const [violationsCharts, setViolationsCharts] = useState<Violation[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);

  // Heatmap + line data (default: TODAY only)
  const [violationsWindowRange, setViolationsWindowRange] = useState<Violation[]>([]);
  const [windowLoading, setWindowLoading] = useState(false);

  // Date filter UI
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");

  // Applied ranges (SPLIT!)
  const [appliedChartsStartISO, setAppliedChartsStartISO] = useState<string | null>(null);
  const [appliedChartsEndISO, setAppliedChartsEndISO] = useState<string | null>(null);

  const [appliedWindowStartISO, setAppliedWindowStartISO] = useState<string | null>(null);
  const [appliedWindowEndISO, setAppliedWindowEndISO] = useState<string | null>(null);
  const [appliedWindowManilaDay, setAppliedWindowManilaDay] = useState<string>("");

  // Default setup:
  // - charts = last 30 days
  // - window = today (Manila)
  useEffect(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const startISO = d.toISOString().slice(0, 10);

    setStartDate(startISO);
    setEndDate(todayISO);

    setAppliedChartsStartISO(dateToStartISO(startISO));
    setAppliedChartsEndISO(dateToEndISO(todayISO));

    const manilaDay = getManilaYMD();
    const { startISO: wStart, endISO: wEnd } = manilaDayToUTCISORange(manilaDay);
    setAppliedWindowStartISO(wStart);
    setAppliedWindowEndISO(wEnd);
    setAppliedWindowManilaDay(manilaDay);
  }, []);

  function onApplyDates() {
    setDateError("");

    if (!startDate || !endDate) {
      setDateError("Please select both start and end dates.");
      return;
    }
    if (startDate > endDate) {
      setDateError("Start date must be before end date.");
      return;
    }

    const sISO = dateToStartISO(startDate);
    const eISO = dateToEndISO(endDate);

    // Apply to BOTH:
    setAppliedChartsStartISO(sISO);
    setAppliedChartsEndISO(eISO);

    setAppliedWindowStartISO(sISO);
    setAppliedWindowEndISO(eISO);
    setAppliedWindowManilaDay("");
  }

  function onClearDates() {
    setDateError("");

    // Reset UI back to last 30 days
    const todayISO = new Date().toISOString().slice(0, 10);
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const startISO = d.toISOString().slice(0, 10);

    setStartDate(startISO);
    setEndDate(todayISO);

    // Reset chart range -> last 30 days
    setAppliedChartsStartISO(dateToStartISO(startISO));
    setAppliedChartsEndISO(dateToEndISO(todayISO));

    // Reset heatmap/line -> TODAY only (Manila)
    const manilaDay = getManilaYMD();
    const { startISO: wStart, endISO: wEnd } = manilaDayToUTCISORange(manilaDay);
    setAppliedWindowStartISO(wStart);
    setAppliedWindowEndISO(wEnd);
    setAppliedWindowManilaDay(manilaDay);
  }

  const chartsRangeLabel = useMemo(
    () => fmtRangeLabel(appliedChartsStartISO, appliedChartsEndISO),
    [appliedChartsStartISO, appliedChartsEndISO]
  );

  const windowRangeLabel = useMemo(() => {
    // If cleared/default -> show "Manila Today (YYYY-MM-DD)"
    if (appliedWindowManilaDay) return `Manila Today (${appliedWindowManilaDay})`;
    // If applied -> show the selected range
    return fmtRangeLabel(appliedWindowStartISO, appliedWindowEndISO);
  }, [appliedWindowManilaDay, appliedWindowStartISO, appliedWindowEndISO]);

  // Shared fetcher
  async function fetchAllViolationsPaginated(startISO: string | null, endISO: string | null) {
    const pageSize = 1000;
    let from = 0;
    let all: Violation[] = [];

    while (true) {
      const to = from + pageSize - 1;

      let q = supabase
        .from("violations")
        .select("id,timestamp,vehicle_class,status,street_name,zone_id,zone_name")
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

  // Fetch charts dataset (last 30 days default)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setChartsLoading(true);
        const rows = await fetchAllViolationsPaginated(appliedChartsStartISO, appliedChartsEndISO);
        if (!cancelled) setViolationsCharts(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setViolationsCharts([]);
      } finally {
        if (!cancelled) setChartsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedChartsStartISO, appliedChartsEndISO]);

  // Fetch heatmap/line dataset (today default)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setWindowLoading(true);
        const rows = await fetchAllViolationsPaginated(appliedWindowStartISO, appliedWindowEndISO);
        if (!cancelled) setViolationsWindowRange(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setViolationsWindowRange([]);
      } finally {
        if (!cancelled) setWindowLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedWindowStartISO, appliedWindowEndISO]);

  // Apply Manila 8-hour window filter to the heatmap/line dataset
  const windowViolations = useMemo(() => {
    return violationsWindowRange.filter((v) => v.timestamp && isWithinManilaWindow(v.timestamp));
  }, [violationsWindowRange]);

  // Map a violation which street zone it belongs to
  function zoneIdForViolation(v: Violation): string | null {
    const text = normalize(v.zone_name) || normalize(v.street_name);
    if (!text) return null;

    const hasBangoy = text.includes("bangoy");
    const hasSoliman = text.includes("soliman");

    if (hasBangoy && hasSoliman) return "bangoy_soliman";
    if (hasSoliman) return "soliman";

    // If some rows only say "Bangoy", count them into the intersection zone (since no Bangoy-only polygon exists here)
    if (hasBangoy) return "bangoy_soliman";

    return null;
  }

  // Heatmap counts per zone
  const zoneCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const z of STREET_ZONES) out.set(z.id, 0);

    for (const v of windowViolations) {
      const zid = zoneIdForViolation(v);
      if (!zid) continue;
      out.set(zid, (out.get(zid) ?? 0) + 1);
    }

    return out;
  }, [windowViolations]);

  const peakZoneCount = useMemo(() => {
    let max = 0;
    for (const z of STREET_ZONES) {
      const c = zoneCounts.get(z.id) ?? 0;
      if (c > max) max = c;
    }
    return max;
  }, [zoneCounts]);

  const zoneBounds = useMemo(() => {
    const all = STREET_ZONES.flatMap((z) => z.polygon);
    try {
      return L.latLngBounds(all as LatLngExpression[]) as unknown as LatLngBoundsExpression;
    } catch {
      return null;
    }
  }, []);

  // Hourly trend
  const hourlyTrend = useMemo(() => {
    const hours: number[] = [];
    for (let h = WINDOW_START_HOUR; h < WINDOW_END_HOUR; h++) hours.push(h);

    const counts = new Map<number, number>();
    for (const h of hours) counts.set(h, 0);

    for (const v of windowViolations) {
      if (!v.timestamp) continue;
      const h = getManilaHour(v.timestamp);
      if (h === null) continue;
      if (h < WINDOW_START_HOUR || h >= WINDOW_END_HOUR) continue;
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }

    return hours.map((h) => ({
      hour: formatHourLabel(h),
      count: counts.get(h) ?? 0,
      _h: h,
    }));
  }, [windowViolations]);

  // Charts computations
  const classCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violationsCharts) {
      const key = (v.vehicle_class || "").toLowerCase().trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    const rows = Array.from(map.entries()).map(([key, count]) => ({
      name: key.replace(/\b\w/g, (s) => s.toUpperCase()),
      key,
      count,
      fill: colorForClass(key),
    }));
    rows.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
    return rows;
  }, [violationsCharts]);

  const classChartData = useMemo(() => classCounts.filter((d) => d.count > 0), [classCounts]);

  const statusData = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violationsCharts) {
      const key = (v.status ?? "unknown").toLowerCase().trim() || "unknown";
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
  }, [violationsCharts]);

  const totalStatus = useMemo(() => statusData.reduce((sum, d) => sum + (d.value || 0), 0), [statusData]);

  const violationsByStreet = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violationsCharts) {
      const street = (v.street_name || "").trim() || "Unknown street";
      map.set(street, (map.get(street) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [violationsCharts]);

  return (
    <div className="page space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Statistics</h1>
          <p className="text-sm text-muted">
            {chartsLoading ? "Loading…" : `${violationsCharts.length} records`} • {chartsRangeLabel}
          </p>
        </div>
      </div>

      {/* Date range */}
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
                className="roam-input mt-1 text-left pr-10 appearance-none [&::-webkit-date-and-time-value]:text-left"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div>
              <label className="roam-label">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="roam-input mt-1 text-left pr-10 appearance-none [&::-webkit-date-and-time-value]:text-left"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onApplyDates}
                className="w-full rounded-2xl bg-orange-600 py-3 text-white font-semibold hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50"
                disabled={chartsLoading || windowLoading}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={onClearDates}
                className="w-full rounded-2xl border border-gray-300 py-3 text-sm font-semibold bg-white hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                disabled={chartsLoading || windowLoading}
              >
                Clear
              </button>
            </div>
          </div>

          {dateError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-sm">{dateError}</div>
          )}
        </div>
      </div>

      {/* Chloropleth tile */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-main">Choropleth Zones</h2>
            <p className="text-xs text-muted">
              {windowRangeLabel} • {WINDOW_LABEL} • {windowLoading ? "Loading…" : `${windowViolations.length} record(s)`}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Peak</div>
            <div className="text-2xl font-bold text-main tabular-nums">{peakZoneCount}</div>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 dark:border-gray-800">
          <MapContainer center={SITE_CENTER} zoom={19} scrollWheelZoom={false} style={{ height: 360, width: "100%" }}>
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapFitBounds bounds={zoneBounds} />

            {STREET_ZONES.filter((z) => z.isActive).map((z) => {
              const count = zoneCounts.get(z.id) ?? 0;
              const tRaw = peakZoneCount > 0 ? count / peakZoneCount : 0;
              const t = count > 0 ? 0.15 + 0.85 * tRaw : 0.03;
              const fill = heatColor(t);

              return (
                <Polygon
                  key={z.id}
                  positions={z.polygon as LatLngExpression[]}
                  pathOptions={{
                    color: "rgba(17, 24, 39, 0.35)",
                    weight: 1.5,
                    fillColor: fill,
                    fillOpacity: count > 0 ? 0.78 : 0.22,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{z.name}</div>
                      <div className="text-xs text-gray-600">
                        {windowRangeLabel} ({WINDOW_LABEL}): <b>{count}</b> violation(s)
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}
          </MapContainer>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span>Low</span>
          <div className="h-3 w-56 rounded" style={{ background: `linear-gradient(to right, ${heatColor(0.03)}, ${heatColor(1)})` }} />
          <span>High</span>
        </div>
      </div>

      {/* Hourly trend tile */}
      <div className="card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-main">Hourly Trend</h2>
            <p className="text-xs text-muted">
              {windowRangeLabel} • {WINDOW_LABEL}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted">Total</div>
            <div className="text-2xl font-bold text-main tabular-nums">{windowViolations.length}</div>
          </div>
        </div>

        <div className="mt-3" style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={hourlyTrend} margin={{ top: 12, right: 16, left: 6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} width={36} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" name="Violations" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vehicle Class */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Vehicle Class Distribution</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
          <div style={{ width: "100%", height: 380 }}>
            <ResponsiveContainer>
              <BarChart
                data={classChartData}
                margin={{ top: 12, right: 16, left: 5, bottom: 0 }}
                barCategoryGap={BAR_CATEGORY_GAP}
                barGap={BAR_GAP}
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                <XAxis {...X_AXIS_COMMON} />
                <YAxis {...Y_AXIS_COMMON} />
                <Tooltip />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} isAnimationActive={false} barSize={BAR_SIZE} maxBarSize={MAX_BAR_SIZE}>
                  {classChartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[340px] overflow-auto pr-1">
            <div className="text-[11px] font-semibold text-main mb-2">Legend</div>
            <div className="space-y-2">
              {classChartData.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: d.fill }} />
                    <span className="text-[11px] text-sub truncate">{d.name}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-main tabular-nums">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Violation Status</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <PieChart>
                <Tooltip />
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {statusData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none -mt-[340px] h-[340px] w-full grid place-items-center">
              <div className="text-center">
                <div className="text-xs text-muted">Total</div>
                <div className="text-2xl font-bold text-main tabular-nums">{totalStatus}</div>
              </div>
            </div>
          </div>

          <div className="max-h-[300px] overflow-auto pr-1">
            <div className="text-[11px] font-semibold text-main mb-2">Legend</div>
            <div className="space-y-2">
              {statusData.map((d) => {
                const pct = totalStatus > 0 ? Math.round((d.value / totalStatus) * 100) : 0;
                return (
                  <div key={d.key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: d.fill }} />
                      <span className="text-[11px] text-sub truncate">{d.name}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-main tabular-nums">
                      {d.value} <span className="text-muted font-normal">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Street */}
      <div className="card p-4">
        <h2 className="text-lg font-semibold mb-3 text-main">Violations by Street</h2>

        {violationsByStreet.length === 0 ? (
          <div className="h-[380px] grid place-items-center text-sm text-muted">No street data available for this range.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3 items-center">
            <div style={{ width: "100%", height: 380 }}>
              <ResponsiveContainer>
                <BarChart data={violationsByStreet} layout="vertical" margin={{ top: 10, right: 16, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                  <XAxis type="number" allowDecimals={false} padding={{ left: 0, right: 8 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#F97316" radius={[0, 10, 10, 0]} barSize={26} isAnimationActive={false} />
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

      <div className="h-6" />
    </div>
  );
}