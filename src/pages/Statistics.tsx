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

import {
  MapContainer,
  TileLayer,
  Polygon,
  Popup,
  useMap,
  CircleMarker,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type Violation = {
  id: string;
  timestamp: string | null;
  vehicle_class: string | null;
  status: string | null;
  street_name?: string | null;
  zone_id?: string | null;
  zone_name?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type ZonePolygon = {
  id: string;
  name: string;
  polygon: [number, number][];
  isActive: boolean;
  baseColor?: string | null;
};

const SITE_CENTER: LatLngExpression = [7.08029007530404, 125.62265921360454];

const STREET_ZONES: ZonePolygon[] = [
  {
    id: "bangoy",
    name: "F. Bangoy St.",
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
    id: "bangoy_soliman",
    name: "F. Bangoy St. & Soliman St.",
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

const VEHICLE_COLORS: Record<string, string> = {
  motorcycle: "#8B5CF6",
  "pickup truck": "#EC4899",
  sedan: "#EF4444",
  suv: "#22C55E",
  tricycle: "#F97316",
  truck: "#3B82F6",
  uv: "#EAB308",
  van: "#06B6D4",
};

function normalizeVehicleClass(value?: string | null) {
  const raw = (value || "").toLowerCase().trim();
  if (!raw) return "";

  const cleaned = raw.replace(/\s+/g, " ");

  const aliasMap: Record<string, string> = {
    motorcycle: "motorcycle",
    motorcycles: "motorcycle",

    "pickup truck": "pickup truck",
    "pickup trucks": "pickup truck",

    sedan: "sedan",
    sedans: "sedan",

    suv: "suv",
    suvs: "suv",

    tricycle: "tricycle",
    tricycles: "tricycle",

    truck: "truck",
    trucks: "truck",

    uv: "uv",
    uvs: "uv",

    van: "van",
    vans: "van",

    buse: "", // 🚫 completely remove it
  };

  if (aliasMap.hasOwnProperty(cleaned)) {
    return aliasMap[cleaned];
  }

  return cleaned.replace(/s$/, "");
}

function colorForClass(c?: string) {
  const key = normalizeVehicleClass(c);
  return VEHICLE_COLORS[key] ?? "#9CA3AF";
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

function manilaDayToUTCISORange(yyyy_mm_dd: string) {
  const startISO = new Date(`${yyyy_mm_dd}T00:00:00+08:00`).toISOString();
  const endISO = new Date(`${yyyy_mm_dd}T23:59:59.999+08:00`).toISOString();
  return { startISO, endISO };
}

const WINDOW_START_HOUR = 10;
const WINDOW_END_HOUR = 18;

function isWithinManilaWindow(tsISO: string) {
  const h = getManilaHour(tsISO);
  if (h === null) return false;
  return h >= WINDOW_START_HOUR && h < WINDOW_END_HOUR;
}

function normalizeStreetValue(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[.,]/g, "")
    .replace(/\bstreet\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalStreetLabel(value?: string | null) {
  const raw = (value || "").trim();
  const normalized = normalizeStreetValue(raw);

  if (!normalized) return "";

  if (normalized === "f bangoy st") {
    return "F. Bangoy St.";
  }

  if (
    normalized === "f bangoy st and soliman st" ||
    normalized === "f bangoy st soliman st"
  ) {
    return "F. Bangoy St. & Soliman St.";
  }

  return raw;
}

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

export default function Statistics() {
  const [violationsCharts, setViolationsCharts] = useState<Violation[]>([]);
  const [chartsLoading, setChartsLoading] = useState(false);

  const [violationsWindowRange, setViolationsWindowRange] = useState<Violation[]>([]);
  const [windowLoading, setWindowLoading] = useState(false);

  const [violationsAllStreet, setViolationsAllStreet] = useState<Violation[]>([]);
  const [streetLoading, setStreetLoading] = useState(false);

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");

  const [appliedChartsStartISO, setAppliedChartsStartISO] = useState<string | null>(null);
  const [appliedChartsEndISO, setAppliedChartsEndISO] = useState<string | null>(null);

  const [appliedWindowStartISO, setAppliedWindowStartISO] = useState<string | null>(null);
  const [appliedWindowEndISO, setAppliedWindowEndISO] = useState<string | null>(null);
  const [appliedWindowManilaDay, setAppliedWindowManilaDay] = useState<string>("");

  const [selectedHour, setSelectedHour] = useState<number>(WINDOW_START_HOUR);

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

    setAppliedChartsStartISO(sISO);
    setAppliedChartsEndISO(eISO);

    setAppliedWindowStartISO(sISO);
    setAppliedWindowEndISO(eISO);
    setAppliedWindowManilaDay("");
  }

  function onClearDates() {
    setDateError("");

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
    setSelectedHour(WINDOW_START_HOUR);
  }

  const chartsRangeLabel = useMemo(
    () => fmtRangeLabel(appliedChartsStartISO, appliedChartsEndISO),
    [appliedChartsStartISO, appliedChartsEndISO]
  );

  const windowRangeLabel = useMemo(() => {
    if (appliedWindowManilaDay) return `Manila Today (${appliedWindowManilaDay})`;
    return fmtRangeLabel(appliedWindowStartISO, appliedWindowEndISO);
  }, [appliedWindowManilaDay, appliedWindowStartISO, appliedWindowEndISO]);

  async function fetchAllViolationsPaginated(startISO: string | null, endISO: string | null) {
    const pageSize = 1000;
    let from = 0;
    let all: Violation[] = [];

    while (true) {
      const to = from + pageSize - 1;

      let q = supabase
        .from("violations")
        .select("id,timestamp,vehicle_class,status,street_name,zone_id,zone_name,lat,lng")
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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setStreetLoading(true);
        const rows = await fetchAllViolationsPaginated(null, null);
        if (!cancelled) setViolationsAllStreet(rows);
      } catch (e) {
        console.error(e);
        if (!cancelled) setViolationsAllStreet([]);
      } finally {
        if (!cancelled) setStreetLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const windowViolations = useMemo(() => {
    return violationsWindowRange.filter((v) => v.timestamp && isWithinManilaWindow(v.timestamp));
  }, [violationsWindowRange]);

  const zoneBounds = useMemo(() => {
    const all = STREET_ZONES.flatMap((z) => z.polygon);
    try {
      return L.latLngBounds(all as LatLngExpression[]) as unknown as LatLngBoundsExpression;
    } catch {
      return null;
    }
  }, []);

  const hourOptions = useMemo(() => {
    const arr: number[] = [];
    for (let h = WINDOW_START_HOUR; h < WINDOW_END_HOUR; h++) arr.push(h);
    return arr;
  }, []);

  const selectedHourViolations = useMemo(() => {
    return windowViolations.filter((v) => {
      if (!v.timestamp) return false;
      if (v.lat == null || v.lng == null) return false;
      const h = getManilaHour(v.timestamp);
      return h === selectedHour;
    });
  }, [windowViolations, selectedHour]);

  const mapHeatPoints = useMemo(() => {
    const buckets = new Map<string, { lat: number; lng: number; count: number }>();

    for (const v of selectedHourViolations) {
      if (v.lat == null || v.lng == null) continue;

      const lat = Number(v.lat);
      const lng = Number(v.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const latKey = lat.toFixed(4);
      const lngKey = lng.toFixed(4);
      const key = `${latKey},${lngKey}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        buckets.set(key, {
          lat: Number(latKey),
          lng: Number(lngKey),
          count: 1,
        });
      }
    }

    return Array.from(buckets.values());
  }, [selectedHourViolations]);

  const maxMapPointCount = useMemo(() => {
    return Math.max(1, ...mapHeatPoints.map((p) => p.count));
  }, [mapHeatPoints]);

const classCounts = useMemo(() => {
  const map = new Map<string, number>();

  for (const v of violationsCharts) {
    const key = normalizeVehicleClass(v.vehicle_class);
    if (!key) continue;

    // 🚫 remove the invalid class
    if (key === "buse") continue;

    map.set(key, (map.get(key) ?? 0) + 1);
  }

  const rows = Array.from(map.entries()).map(([key, count]) => ({
    name: key.replace(/\b\w/g, (s) => s.toUpperCase()),
    key,
    count,
    fill: colorForClass(key),
  }));

  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return rows;
}, [violationsCharts]);

  const classChartData = useMemo(() => classCounts.filter((d) => d.count > 0), [classCounts]);

  const violationsByStreet = useMemo(() => {
    const counts = new Map<string, number>();

    for (const v of violationsAllStreet) {
      const sourceStreet = v.street_name || v.zone_name || "";
      const street = canonicalStreetLabel(sourceStreet);

      if (!street) continue;

      counts.set(street, (counts.get(street) ?? 0) + 1);
    }

    const rows = Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));

    rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return rows;
  }, [violationsAllStreet]);

  return (
    <div className="page space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-main">Statistics</h1>
          <p className="text-sm text-muted">
            {chartsLoading ? "Loading…" : `${violationsCharts.length} records`} • {chartsRangeLabel}
          </p>
        </div>
      </div>

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
                className="roam-input mt-1 appearance-none pr-10 text-left [&::-webkit-date-and-time-value]:text-left"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div>
              <label className="roam-label">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="roam-input mt-1 appearance-none pr-10 text-left [&::-webkit-date-and-time-value]:text-left"
                style={{ WebkitAppearance: "none" }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onApplyDates}
                className="w-full rounded-2xl bg-orange-600 py-3 font-semibold text-white hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50"
                disabled={chartsLoading || windowLoading}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={onClearDates}
                className="w-full rounded-2xl border border-gray-300 bg-white py-3 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
                disabled={chartsLoading || windowLoading}
              >
                Clear
              </button>
            </div>
          </div>

          {dateError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {dateError}
            </div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-main">Map Heatmap</h2>
            <p className="text-xs text-muted">
              {windowRangeLabel} • {formatHourLabel(selectedHour)} •{" "}
              {windowLoading ? "Loading…" : `${selectedHourViolations.length} record(s)`}
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted">Peak point</div>
            <div className="text-2xl font-bold tabular-nums text-main">{maxMapPointCount}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 dark:border-gray-800">
          <MapContainer
            center={SITE_CENTER}
            zoom={19}
            scrollWheelZoom={false}
            style={{ height: 380, width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFitBounds bounds={zoneBounds} />

            {STREET_ZONES.filter((z) => z.isActive).map((z) => (
              <Polygon
                key={z.id}
                positions={z.polygon as LatLngExpression[]}
                pathOptions={{
                  color: "rgba(17, 24, 39, 0.25)",
                  weight: 1,
                  fillOpacity: 0.04,
                }}
              >
                <Popup>
                  <div className="text-sm font-medium">{z.name}</div>
                </Popup>
              </Polygon>
            ))}

            {mapHeatPoints.map((p, i) => {
              const t = p.count / maxMapPointCount;
              const fill = heatColor(0.2 + 0.8 * t);
              const radius = 14 + t * 26;

              return (
                <CircleMarker
                  key={i}
                  center={[p.lat, p.lng]}
                  radius={radius}
                  pathOptions={{
                    color: fill,
                    fillColor: fill,
                    fillOpacity: 0.42,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{formatHourLabel(selectedHour)}</div>
                      <div>{p.count} violation(s)</div>
                      <div className="text-xs text-gray-600">
                        {p.lat}, {p.lng}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold text-main">Time</div>
          <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
            {hourOptions.map((h) => {
              const active = h === selectedHour;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setSelectedHour(h)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-orange-600 text-white"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800"
                  }`}
                >
                  {formatHourLabel(h)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-muted">
          <span>Low</span>
          <div
            className="h-3 w-56 rounded"
            style={{
              background: `linear-gradient(to right, ${heatColor(0.2)}, ${heatColor(1)})`,
            }}
          />
          <span>High</span>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-lg font-semibold text-main">Vehicle Class Distribution</h2>

        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_190px]">
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
                <Bar
                  dataKey="count"
                  radius={[10, 10, 0, 0]}
                  isAnimationActive={false}
                  barSize={BAR_SIZE}
                  maxBarSize={MAX_BAR_SIZE}
                >
                  {classChartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[340px] overflow-auto pr-1">
            <div className="mb-2 text-[11px] font-semibold text-main">Legend</div>
            <div className="space-y-2">
              {classChartData.map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ backgroundColor: d.fill }}
                    />
                    <span className="truncate text-[11px] text-sub">{d.name}</span>
                  </div>
                  <span className="text-[11px] font-semibold tabular-nums text-main">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-main">Violations by Street</h2>
            <p className="text-xs text-muted">
              {streetLoading ? "Loading…" : "All records • based on database values"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_190px]">
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart
                data={violationsByStreet}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                barCategoryGap="35%"
              >
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />

                <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />

                <YAxis allowDecimals={false} width={30} />

                <Tooltip />

                <Bar
                  dataKey="count"
                  fill="#F97316"
                  radius={[10, 10, 0, 0]}
                  barSize={70}
                  isAnimationActive={false}
                  label={{ position: "top", fontSize: 12 }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="max-h-[300px] overflow-auto pr-1">
            <div className="mb-2 text-[11px] font-semibold text-main">Street totals</div>
            <div className="space-y-2">
              {violationsByStreet.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[11px] text-sub">{d.name}</span>
                  <span className="text-[11px] font-semibold tabular-nums text-main">{d.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}