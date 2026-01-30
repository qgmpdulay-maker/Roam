import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Violator = {
  id: string;
  full_name: string;
  license_plate: string;
  address: string | null;
  contact_no: string | null;
  has_driver_license: boolean;
  has_orcr: boolean;
  note: string | null;
  created_at: string;
};

export default function Violators() {
  const [violators, setViolators] = useState<Violator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("violators")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setViolators(data);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="page space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-main">Violators</h1>
        <p className="text-sm text-muted">
          {loading ? "Loading…" : `${violators.length} recorded violators`}
        </p>
      </div>

      {violators.map((v) => (
        <div key={v.id} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-main">{v.full_name}</div>
              <div className="text-sm text-sub">{v.license_plate}</div>
            </div>

            <div className="text-xs text-muted">
              {new Date(v.created_at).toLocaleDateString()}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted">Driver’s License</span>
              <div className={v.has_driver_license ? "text-green-600" : "text-red-600"}>
                {v.has_driver_license ? "Yes" : "No"}
              </div>
            </div>

            <div>
              <span className="text-muted">OR/CR</span>
              <div className={v.has_orcr ? "text-green-600" : "text-red-600"}>
                {v.has_orcr ? "Yes" : "No"}
              </div>
            </div>
          </div>

          {v.note && (
            <div className="mt-3 text-sm text-sub">
              <span className="font-medium">Note:</span> {v.note}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}