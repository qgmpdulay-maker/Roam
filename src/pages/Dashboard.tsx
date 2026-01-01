import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";

/* =============================================================================
   Streets (Davao)
============================================================================= */

function normalize(s?: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ZONES = {
  soliman_crossing: {
    key: "soliman_crossing",
    label: "Soliman St & F Bangoy St",
    coords: [7.0825, 125.6239] as LatLngExpression,
    matchers: [
      "soliman st & f bangoy st",
      "soliman f bangoy",
      "soliman street & f bangoy street",
      "soliman crossing",
      "soliman",
    ].map(normalize),
  },
  bangoy: {
    key: "bangoy",
    label: "F. Bangoy St",
    coords: [7.0858, 125.6281] as LatLngExpression,
    matchers: [
      "f. bangoy st",
      "f bangoy st",
      "bangoy st",
      "bangoy",
      "f. bangoy",
      "f bangoy",
    ].map(normalize),
  },
} as const;

const ZONE_LIST = [ZONES.soliman_crossing, ZONES.bangoy] as const;

function zoneKeyFromRow(
  streetName?: string | null,
  zoneName?: string | null
): keyof typeof ZONES | null {
  const street = normalize(streetName ?? "");
  const zone = normalize(zoneName ?? "");
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

/* =============================================================================
   Dashboard
============================================================================= */

export default function Dashboard() {
  const { user } = useAuth();

  const [violations, setViolations] = useState<Violation[]>([]);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");

  const mapCenter = useMemo(
    () => averageCenter(ZONE_LIST.map((z) => z.coords)),
    []
  );

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

  // initial load + realtime
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
            return next;
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
      const s = statusLabel(v.status).toLowerCase(); // "pending" | "resolved"
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
      .slice(0, 6);

    return {
      today: today.length,
      pending: pending.length,
      resolved: resolved.length,
      byClass,
    };
  }, [violations]);

  return (
    <div className="min-h-screen flex flex-col px-4 py-4 gap-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="text-xs text-gray-500">
          Signed in as <span className="font-medium">{user?.email ?? "—"}</span>
        </p>
      </div>

      {/* Map */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <MapContainer
          center={mapCenter}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: 300, width: "100%" }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* fixed street pins */}
          {ZONE_LIST.map((z) => (
            <CircleMarker
              key={z.key}
              center={z.coords}
              radius={8}
              color="#111827"
              fillColor="#ffffff"
              fillOpacity={1}
            >
              <Popup>
                <div className="text-sm">{z.label}</div>
              </Popup>
            </CircleMarker>
          ))}

          {/* violations pins */}
          {filtered.map((v) => {
            const k = zoneKeyFromRow(v.street_name, v.zone_name);
            if (!k) return null;
            const zone = ZONES[k];
            const col = colorForClass(v.vehicle_class ?? undefined);

            return (
              <CircleMarker
                key={v.id}
                center={zone.coords}
                radius={7}
                color="#111827"
                weight={1}
                fillColor={col}
                fillOpacity={0.85}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-medium">
                      {titleCase(v.vehicle_class) || "Vehicle"}
                    </div>
                    <div className="text-xs text-gray-600">
                      {v.violation_type || "Violation"}
                    </div>
                    <div className="text-xs text-gray-600">
                      {v.street_name || zone.label}
                    </div>
                    <div className="mt-1 text-xs">
                      Status:{" "}
                      <span
                        className={
                          statusLabel(v.status) === "Resolved"
                            ? "text-green-600"
                            : "text-orange-600"
                        }
                      >
                        {statusLabel(v.status)}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {new Date(
                        v.timestamp ?? v.created_at ?? Date.now()
                      ).toLocaleString()}
                    </div>
                    {v.image_url && (
                      <img
                        src={v.image_url}
                        alt="evidence"
                        className="mt-2 h-20 w-full rounded object-cover"
                      />
                    )}
                    {/* NEW: quick jump to details */}
                    <Link
                      to={`/violation/${v.id}`}
                      className="mt-2 inline-flex items-center rounded-lg border border-orange-300 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50"
                    >
                      View details →
                    </Link>
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
          className="rounded-xl border border-gray-300 bg-white p-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>

        <select
          className="rounded-xl border border-gray-300 bg-white p-2 text-sm capitalize"
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="all">All Classes</option>
          {VEHICLE_ORDER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border border-gray-300 bg-white p-2 text-sm"
          value={zoneFilter}
          onChange={(e) => setZoneFilter(e.target.value as any)}
        >
          <option value="all">All Streets</option>
          <option value="soliman_crossing">{ZONES.soliman_crossing.label}</option>
          <option value="bangoy">{ZONES.bangoy.label}</option>
        </select>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{stats.today}</div>
          <div className="text-xs text-gray-500">Violations Today</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{stats.pending}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{stats.resolved}</div>
          <div className="text-xs text-gray-500">Resolved</div>
        </div>
      </div>

      {/* Violations feed (now interactive) */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold">Violations Feed</div>
          <div className="text-xs text-gray-500">{filtered.length} total</div>
        </div>

        <div className="h-full max-h-[420px] overflow-y-auto pr-1">
          <ul className="divide-y divide-gray-100">
            {filtered.map((v) => {
              const zoneKey = zoneKeyFromRow(v.street_name, v.zone_name) ?? "bangoy";
              const streetLabel = v.street_name || ZONES[zoneKey].label;

              return (
                <li key={v.id} className="py-0">
                  {/* Make the entire row a link */}
                  <Link
                    to={`/violation/${v.id}`}
                    className="block py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70 rounded-lg -mx-2 px-2 hover:bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      {v.image_url ? (
                        <img
                          src={v.image_url}
                          alt=""
                          className="h-12 w-16 rounded object-cover"
                        />
                      ) : (
                        <div className="h-12 w-16 rounded bg-gray-100 grid place-items-center text-[10px] text-gray-500">
                          No Image
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">
                            {titleCase(v.vehicle_class) || "Vehicle"}
                          </div>
                          <span
                            className={`text-xs ${
                              statusLabel(v.status) === "Resolved"
                                ? "text-green-600"
                                : "text-orange-600"
                            }`}
                          >
                            {statusLabel(v.status)}
                          </span>
                        </div>

                        <div className="text-xs text-gray-600">
                          {v.violation_type || "Violation"} • {streetLabel}
                        </div>

                        <div className="text-[11px] text-gray-400">
                          {new Date(
                            v.timestamp ?? v.created_at ?? Date.now()
                          ).toLocaleString()}
                          {typeof v.duration_seconds === "number" && (
                            <> • {v.duration_seconds}s</>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-gray-300"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </Link>
                </li>
              );
            })}

            {filtered.length === 0 && (
              <li className="py-6 text-center text-xs text-gray-500">
                No violations match your filters.
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="h-6" />
    </div>
  );
}