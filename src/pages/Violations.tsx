import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

const STREETS = {
  SOLIMAN: "Soliman St & F Bangoy St",
  FBANGOY: "F. Bangoy St",
} as const;

type Status = "pending" | "resolved" | "all";
type StreetKey = "all" | "SOLIMAN" | "FBANGOY";
type SortOrder = "asc" | "desc";

type Violation = {
  id: string;
  timestamp: string | null;
  street_name: string | null;
  zone_name: string | null;
  violation_type: string | null;
  vehicle_class: string | null;
  image_url: string | null;
  status: string | null;
  created_at: string | null;
};

function normStatus(s?: string | null): "pending" | "resolved" {
  return (s ?? "pending").toLowerCase() === "resolved" ? "resolved" : "pending";
}

function streetKey(name?: string | null): StreetKey {
  const n = (name ?? "").toLowerCase();
  if (n.includes("soliman") && n.includes("bangoy")) return "SOLIMAN";
  if (n.includes("f. bangoy") || n.includes("bangoy st")) return "FBANGOY";
  return "all";
}

function streetLabel(k: StreetKey): string {
  if (k === "SOLIMAN") return STREETS.SOLIMAN;
  if (k === "FBANGOY") return STREETS.FBANGOY;
  return "All Streets";
}

function getViolationDate(v: Violation) {
  return new Date(v.timestamp ?? v.created_at ?? Date.now());
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fieldClass =
  "w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none appearance-none";

export default function Violations() {
  const nav = useNavigate();
  const [rows, setRows] = useState<Violation[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status>("pending");
  const [streetFilter, setStreetFilter] = useState<StreetKey>("all");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    setLoading(true);

    const { data, error } = await supabase
      .from("violations")
      .select(
        "id,timestamp,street_name,zone_name,violation_type,vehicle_class,image_url,status,created_at"
      )
      .order("timestamp", { ascending: false })
      .limit(500);

    if (!error && data) setRows(data as Violation[]);
    if (error) console.error(error);

    setLoading(false);
  }

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    fetchData();

    const ch = supabase
      .channel("realtime-violations-dropdowns")
      .on("postgres_changes", { event: "*", schema: "public", table: "violations" }, () => {
        fetchData();
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      void ch.unsubscribe();
    };
  }, []);

  const filtered = useMemo(() => {
    const result = rows.filter((r) => {
      const sOk = statusFilter === "all" ? true : normStatus(r.status) === statusFilter;
      const stKey = streetKey(r.street_name ?? r.zone_name ?? "");
      const zOk = streetFilter === "all" ? true : stKey === streetFilter;

      const violationDate = getViolationDate(r);
      const rowDate = toDateInputValue(violationDate);

      const startOk = startDateFilter ? rowDate >= startDateFilter : true;
      const endOk = endDateFilter ? rowDate <= endDateFilter : true;

      return sOk && zOk && startOk && endOk;
    });

    result.sort((a, b) => {
      const aTime = getViolationDate(a).getTime();
      const bTime = getViolationDate(b).getTime();
      return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [rows, statusFilter, streetFilter, startDateFilter, endDateFilter, sortOrder]);

  const grouped = useMemo(() => {
    const map = new Map<string, Violation[]>();

    const push = (label: string, v: Violation) => {
      const arr = map.get(label) ?? [];
      arr.push(v);
      map.set(label, arr);
    };

    if (streetFilter === "all") {
      filtered.forEach((v) => {
        const k = streetKey(v.street_name ?? v.zone_name ?? "");
        const label = streetLabel(k === "all" ? "all" : k);
        push(label, v);
      });

      const order = [streetLabel("SOLIMAN"), streetLabel("FBANGOY"), streetLabel("all")];

      return Array.from(map.entries()).sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);

        if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }

    map.set(streetLabel(streetFilter), filtered);
    return Array.from(map.entries());
  }, [filtered, streetFilter]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => normStatus(r.status) === "pending").length;
    const resolved = rows.filter((r) => normStatus(r.status) === "resolved").length;
    return { total: rows.length, pending, resolved };
  }, [rows]);

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Violations</h1>
        <div className="text-xs text-gray-500">{counts.total} total</div>
      </div>

      <div className="mb-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-gray-500">Status</span>
            <select
              className={fieldClass}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status)}
            >
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-gray-500">Street</span>
            <select
              className={fieldClass}
              value={streetFilter}
              onChange={(e) => setStreetFilter(e.target.value as StreetKey)}
            >
              <option value="all">All Streets</option>
              <option value="SOLIMAN">{STREETS.SOLIMAN}</option>
              <option value="FBANGOY">{STREETS.FBANGOY}</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-gray-500">Start Date</span>
            <input
              type="date"
              className={fieldClass}
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              max={endDateFilter || undefined}
            />
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-xs font-medium text-gray-500">End Date</span>
            <input
              type="date"
              className={fieldClass}
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              min={startDateFilter || undefined}
            />
          </label>
        </div>

        <label className="block min-w-0">
          <span className="mb-1 block text-xs font-medium text-gray-500">Sort</span>
          <select
            className={fieldClass}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </label>
      </div>

      <div className="mb-3">
        <button
          type="button"
          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-medium text-gray-700 active:bg-gray-50"
          onClick={() => {
            setStatusFilter("pending");
            setStreetFilter("all");
            setStartDateFilter("");
            setEndDateFilter("");
            setSortOrder("desc");
          }}
        >
          Reset Filters
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{counts.pending}</div>
          <div className="text-xs text-gray-500">Pending</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{counts.resolved}</div>
          <div className="text-xs text-gray-500">Resolved</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3 text-center">
          <div className="text-xl font-semibold">{counts.total}</div>
          <div className="text-xs text-gray-500">All</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading && <div className="p-4 text-xs text-gray-500">Loading…</div>}

        {!loading && grouped.length === 0 && (
          <div className="p-6 text-center text-xs text-gray-500">
            No violations found for your filters.
          </div>
        )}

        {!loading && grouped.length > 0 && (
          <div className="divide-y divide-gray-100">
            {grouped.map(([label, items]) => (
              <section key={label}>
                <div className="sticky top-0 z-[1] border-b border-gray-100 bg-white/95 px-3 py-2 text-xs font-medium text-gray-500 backdrop-blur">
                  {label} • {items.length}
                </div>

                <ul className="divide-y divide-gray-100">
                  {items.map((v) => {
                    const status = normStatus(v.status);

                    return (
                      <li
                        key={v.id}
                        className="px-3 py-3 active:bg-gray-50"
                        onClick={() => nav(`/violation/${v.id}`)}
                      >
                        <div className="flex items-start gap-3">
                          {v.image_url ? (
                            <img
                              src={v.image_url}
                              alt=""
                              className="h-12 w-16 rounded object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="grid h-12 w-16 place-items-center rounded bg-gray-100 text-[10px] text-gray-500">
                              No Image
                            </div>
                          )}

                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium capitalize">
                                {v.vehicle_class ?? "vehicle"}
                              </div>
                              <span
                                className={`text-xs ${
                                  status === "resolved" ? "text-green-600" : "text-orange-600"
                                }`}
                              >
                                {status === "resolved" ? "Resolved" : "Pending"}
                              </span>
                            </div>

                            <div className="text-xs text-gray-600">
                              {v.violation_type ?? "Violation"} •{" "}
                              {v.street_name ?? v.zone_name ?? "—"}
                            </div>

                            <div className="text-[11px] text-gray-400">
                              {getViolationDate(v).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div className="h-24" />
    </div>
  );
}