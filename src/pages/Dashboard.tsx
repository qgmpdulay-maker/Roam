import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";

/* =============================================================================
   Streets
============================================================================= */

function normalize(s?: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ZONES = {
  bangoy_soliman: {
    key: "bangoy_soliman",
    label: "F. Bangoy St. & Soliman St.",
    coords: [7.080276079684613, 125.62266174237404] as LatLngExpression,
    matchers: [
      "f bangoy st soliman st",
      "f bangoy st & soliman st",
      "bangoy soliman",
      "soliman crossing",
      "intersection",
    ].map(normalize),
  },
  bangoy: {
    key: "bangoy",
    label: "F. Bangoy St.",
    coords: [7.080341958130678, 125.62260139267624] as LatLngExpression,
    matchers: ["f bangoy st", "f bangoy", "bangoy st", "bangoy"].map(normalize),
  },
} as const;

const ZONE_LIST = [ZONES.bangoy_soliman, ZONES.bangoy] as const;

function zoneKeyFromRow(
  streetName?: string | null,
  zoneName?: string | null
): keyof typeof ZONES | null {
  const street = normalize(streetName ?? "");
  const zone = normalize(zoneName ?? "");

  if (street.includes("soliman") && street.includes("bangoy")) return "bangoy_soliman";
  if (zone.includes("soliman") && zone.includes("bangoy")) return "bangoy_soliman";
  if (street.includes("bangoy")) return "bangoy";
  if (zone.includes("bangoy")) return "bangoy";

  for (const z of ZONE_LIST) {
    for (const m of z.matchers) {
      if (street.includes(m) || zone.includes(m)) return z.key;
    }
  }

  return null;
}

function averageCenter(points: LatLngExpression[]): LatLngExpression {
  const arr = points as [number, number][];
  const lat = arr.reduce((s, p) => s + p[0], 0) / arr.length;
  const lng = arr.reduce((s, p) => s + p[1], 0) / arr.length;
  return [lat, lng];
}

/* =============================================================================
   Vehicle classes & colors
============================================================================= */

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

function colorForClass(c?: string): string {
  if (!c) return "#9ca3af";
  const key = c.toLowerCase();
  return VEHICLE_COLORS[key] ?? "#9ca3af";
}

function titleCase(s?: string | null) {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (m) => m.toUpperCase())
    .replace(/\bUv\b/, "UV");
}

function statusLabel(s?: string | null) {
  const x = (s ?? "pending").toLowerCase();
  return x === "resolved" ? "Resolved" : "Pending";
}

function isTodayISO(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/* =============================================================================
   Types
============================================================================= */

type Violation = {
  id: string;
  timestamp: string | null;
  zone_name: string | null;
  street_name: string | null;
  violation_type: string | null;
  vehicle_class: string | null;
  duration_seconds: number | null;
  image_url: string | null;
  status: string | null;
  created_at: string | null;
  vehicle_id: string | null;
};

type ZoneSummary = {
  key: keyof typeof ZONES;
  label: string;
  count: number;
  pending: number;
  resolved: number;
};

type VehicleSummary = {
  type: string;
  count: number;
};

type StreetSummary = {
  key: string;
  label: string;
  count: number;
};

type StatusSummary = {
  label: string;
  count: number;
};

/* =============================================================================
   Dashboard
============================================================================= */

export default function Dashboard() {
  const { user } = useAuth();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  // Search for recent violations
  const [recentSearch, setRecentSearch] = useState("");

  const mapCenter = useMemo(() => averageCenter(ZONE_LIST.map((z) => z.coords)), []);

  async function fetchViolations() {
    const { data, error } = await supabase
      .from("violations")
      .select(
        "id,timestamp,zone_name,street_name,violation_type,vehicle_class,duration_seconds,image_url,status,created_at,vehicle_id"
      )
      .order("timestamp", { ascending: false })
      .limit(300);

    if (!error && data) setViolations(data as Violation[]);
    else if (error) console.error(error);
  }

  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchViolations();

    const ch = supabase
      .channel("realtime-violations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "violations" },
        (payload) => {
          setViolations((prev) => {
            const next = [...prev];
            const row = (payload.new || payload.old) as Violation;
            const idx = next.findIndex((v) => v.id === row.id);

            if (payload.eventType === "DELETE") {
              if (idx !== -1) next.splice(idx, 1);
              return next;
            }

            if (idx === -1) next.unshift(row);
            else next[idx] = row;

            return next
              .sort((a, b) => {
                const ta = new Date(a.timestamp ?? a.created_at ?? 0).getTime();
                const tb = new Date(b.timestamp ?? b.created_at ?? 0).getTime();
                return tb - ta;
              })
              .slice(0, 300);
          });
        }
      )
      .subscribe();

    realtimeRef.current = ch;
    return () => {
      ch.unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      const s = statusLabel(v.status).toLowerCase();
      const cls = (v.vehicle_class || "").toLowerCase();
      const zkey = zoneKeyFromRow(v.street_name, v.zone_name);

      const okStatus = statusFilter === "all" ? true : s === statusFilter;
      const okClass = classFilter === "all" ? true : cls === classFilter;
      const okZone = zoneFilter === "all" ? true : zkey === zoneFilter;

      return okStatus && okClass && okZone;
    });
  }, [violations, classFilter, statusFilter, zoneFilter]);

  const stats = useMemo(() => {
    const today = violations.filter((v) => isTodayISO(v.timestamp));
    const pending = violations.filter(
      (v) => statusLabel(v.status).toLowerCase() === "pending"
    );
    const resolved = violations.filter(
      (v) => statusLabel(v.status).toLowerCase() === "resolved"
    );

    const byClassMap = new Map<string, number>();
    today.forEach((v) => {
      const k = (v.vehicle_class || "unknown").toLowerCase();
      byClassMap.set(k, (byClassMap.get(k) ?? 0) + 1);
    });

    const byClass = Array.from(byClassMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      today: today.length,
      pending: pending.length,
      resolved: resolved.length,
      byClass,
    };
  }, [violations]);

  const zoneSummaries = useMemo<ZoneSummary[]>(() => {
    const base: Record<string, ZoneSummary> = {
      bangoy: {
        key: "bangoy",
        label: ZONES.bangoy.label,
        count: 0,
        pending: 0,
        resolved: 0,
      },
      bangoy_soliman: {
        key: "bangoy_soliman",
        label: ZONES.bangoy_soliman.label,
        count: 0,
        pending: 0,
        resolved: 0,
      },
    };

    for (const v of filtered) {
      const k = zoneKeyFromRow(v.street_name, v.zone_name);
      if (!k) continue;
      base[k].count += 1;
      if (statusLabel(v.status) === "Resolved") base[k].resolved += 1;
      else base[k].pending += 1;
    }

    return Object.values(base).sort((a, b) => b.count - a.count);
  }, [filtered]);

  // Searchable filtered results for the recent violations section
  const searchedViolations = useMemo(() => {
    const q = normalize(recentSearch);

    if (!q) return filtered;

    return filtered.filter((v) => {
      const zoneKey = zoneKeyFromRow(v.street_name, v.zone_name);
      const streetName = v.street_name || (zoneKey ? ZONES[zoneKey].label : "");
      const violationType = v.violation_type || "";
      const vehicleType = v.vehicle_class || "";
      const statusText = statusLabel(v.status);

      const haystack = [streetName, violationType, vehicleType, statusText]
        .map(normalize)
        .join(" ");

      return haystack.includes(q);
    });
  }, [filtered, recentSearch]);

  const recentViolations = useMemo(() => {
    return searchedViolations.slice(0, 5);
  }, [searchedViolations]);

  const recentSummary = useMemo(() => {
    const vehicleMap = new Map<string, number>();
    const streetMap = new Map<string, number>();
    const statusMap = new Map<string, number>();

    recentViolations.forEach((v) => {
      const vehicleKey = (v.vehicle_class || "unknown").toLowerCase();
      vehicleMap.set(vehicleKey, (vehicleMap.get(vehicleKey) ?? 0) + 1);

      const zoneKey = zoneKeyFromRow(v.street_name, v.zone_name);
      const streetLabel = v.street_name || (zoneKey ? ZONES[zoneKey].label : "Unknown Street");
      streetMap.set(streetLabel, (streetMap.get(streetLabel) ?? 0) + 1);

      const status = statusLabel(v.status);
      statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    });

    const vehicles: VehicleSummary[] = Array.from(vehicleMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    const streets: StreetSummary[] = Array.from(streetMap.entries())
      .map(([label, count]) => ({
        key: label,
        label,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    const statuses: StatusSummary[] = Array.from(statusMap.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    return {
      total: recentViolations.length,
      vehicles,
      streets,
      statuses,
    };
  }, [recentViolations]);

  return (
    <div className="min-h-screen flex flex-col px-4 py-4 gap-4 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Signed in as{" "}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {user?.email ?? "—"}
          </span>
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stats.today}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Violations Today</div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stats.pending}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Pending</div>
        </div>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 text-center">
          <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stats.resolved}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Resolved</div>
        </div>
      </div>

      {/* Useful summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Top Streets
          </div>
          <div className="space-y-2">
            {zoneSummaries.map((z) => (
              <div
                key={z.key}
                className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {z.label}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {z.count}
                  </div>
                </div>
                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Pending {z.pending} • Resolved {z.resolved}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
          <div className="text-sm font-semibold mb-3 text-gray-900 dark:text-gray-100">
            Most Common Vehicle Classes Today
          </div>
          {stats.byClass.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">No data for today.</div>
          ) : (
            <div className="space-y-2">
              {stats.byClass.map((item) => (
                <div key={item.type} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: colorForClass(item.type) }}
                  />
                  <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                    {titleCase(item.type)}
                  </div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {item.count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Smaller, more useful map */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Street Hotspots
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Filtered overview of active streets
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{filtered.length} visible</div>
        </div>

        <MapContainer
          center={mapCenter}
          zoom={18}
          scrollWheelZoom={false}
          style={{ height: 220, width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {zoneSummaries.map((z) => {
            const zone = ZONES[z.key];
            const radius = z.count > 0 ? Math.min(28, 10 + z.count * 1.5) : 8;

            return (
              <CircleMarker
                key={z.key}
                center={zone.coords}
                radius={radius}
                color="#111827"
                weight={1}
                fillColor={z.count > 0 ? "#F97316" : "#D1D5DB"}
                fillOpacity={z.count > 0 ? 0.65 : 0.5}
              >
                <Popup>
                  <div className="text-sm text-gray-900">
                    <div className="font-medium">{zone.label}</div>
                    <div className="text-xs text-gray-600">Total: {z.count}</div>
                    <div className="text-xs text-gray-600">
                      Pending: {z.pending} • Resolved: {z.resolved}
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-2">
        <select
          className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100 capitalize"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="all">All Classes</option>
          {VEHICLE_ORDER.map((c) => (
            <option key={c} value={c}>
              {titleCase(c)}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100"
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value)}
        >
          <option value="all">All Streets</option>
          <option value="bangoy">{ZONES.bangoy.label}</option>
          <option value="bangoy_soliman">{ZONES.bangoy_soliman.label}</option>
        </select>

        {/* Long search field below the filters */}
        <input
          type="text"
          placeholder="Search street, violation, vehicle, or status"
          className="col-span-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          value={recentSearch}
          onChange={(e) => setRecentSearch(e.target.value)}
        />
      </div>

      {/* Recent violations summary */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Recent Violations
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Most recent filtered results
          </div>
        </div>

        <div className="space-y-2">
          {recentViolations.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">No recent violations.</div>
          ) : (
            recentViolations.map((v) => {
              const zoneKey = zoneKeyFromRow(v.street_name, v.zone_name) ?? "bangoy";
              const streetName = v.street_name || ZONES[zoneKey].label;

              return (
                <Link
                  key={v.id}
                  to={`/violation/${v.id}`}
                  className="block rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                        {titleCase(v.vehicle_class) || "Vehicle"}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {v.violation_type || "Violation"} • {streetName}
                      </div>
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        statusLabel(v.status) === "Resolved"
                          ? "text-green-600"
                          : "text-orange-600"
                      }`}
                    >
                      {statusLabel(v.status)}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom summary based on recent violations */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Recent Violations Summary
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Based on {recentSummary.total} recent result{recentSummary.total === 1 ? "" : "s"}
          </div>
        </div>

        {recentSummary.total === 0 ? (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            No summary available.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3">
              <div className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                Vehicle Classes
              </div>
              <div className="space-y-2">
                {recentSummary.vehicles.map((item) => (
                  <div key={item.type} className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: colorForClass(item.type) }}
                    />
                    <div className="flex-1 text-sm text-gray-900 dark:text-gray-100">
                      {titleCase(item.type) || "Unknown"}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3">
              <div className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                Streets
              </div>
              <div className="space-y-2">
                {recentSummary.streets.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3">
                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {item.label}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 p-3">
              <div className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">
                Status
              </div>
              <div className="space-y-2">
                {recentSummary.statuses.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-3">
                    <div
                      className={`text-sm ${
                        item.label === "Resolved" ? "text-green-600" : "text-orange-600"
                      }`}
                    >
                      {item.label}
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {item.count}
                    </div>
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