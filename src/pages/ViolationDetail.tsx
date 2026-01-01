import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase"; // <- relative path fallback

type Violation = {
  id: string;
  image_url: string | null;
  violation_type: string | null;
  street_name: string | null;
  vehicle_class: string | null;
  timestamp: string | null;
  status: string | null;
  license_plate: string | null; // from violations table
  violator_name: string | null; // snapshot on violation
  violator_id: string | null;   // FK -> violators.id
};

function cap(s?: string | null) {
  if (!s) return "—";
  return s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

/** ABC 123 or ABC 1234 (exactly 3 letters, space, 3–4 digits) */
const PLATE_REGEX = /^[A-Z]{3}\s\d{3,4}$/;

/** PH mobile: 11 digits, starts with 09 (e.g., 09271351640) */
const PHONE_REGEX = /^09\d{9}$/;

/** Keep only letters/digits, force uppercase, insert a space after the first 3 letters */
function normalizePlate(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = raw.slice(0, 3).replace(/[^A-Z]/g, "");
  const digits = raw.slice(3).replace(/\D/g, "").slice(0, 4);
  if (!letters) return "";
  return digits ? `${letters} ${digits}` : letters;
}

export default function ViolationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [row, setRow] = useState<Violation | null>(null);

  const [violatorName, setViolatorName] = useState("");
  const [plate, setPlate] = useState("");

  const [address, setAddress] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [hasOrCr, setHasOrCr] = useState(false);
  const [hasLicense, setHasLicense] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      if (!id) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("violations")
        .select("*")
        .eq("id", id)
        .single();

      if (!live) return;

      if (error) {
        console.error(error);
        setError("Failed to load violation.");
        setLoading(false);
        return;
      }

      const v = data as Violation;
      setRow(v);
      setPlate(normalizePlate(v.license_plate ?? ""));
      setViolatorName(v.violator_name ?? "");

      // If this violation is already linked to a violator, load extra details
      if (v.violator_id) {
        const { data: violator, error: violatorErr } = await supabase
          .from("violators")
          .select(
            "full_name, license_plate, address, contact_no, has_orcr, has_driver_license, note"
          )
          .eq("id", v.violator_id)
          .maybeSingle();

        if (!violatorErr && violator) {
          if (violator.full_name && !v.violator_name) {
            setViolatorName(violator.full_name);
          }
          if (violator.license_plate && !v.license_plate) {
            setPlate(normalizePlate(violator.license_plate));
          }
          setAddress(violator.address ?? "");
          setContactNo((violator.contact_no ?? "").replace(/[^0-9]/g, "")); // keep digits only
          setHasOrCr(Boolean(violator.has_orcr));
          setHasLicense(Boolean(violator.has_driver_license));
          setNote(violator.note ?? "");
        }
      }

      setLoading(false);
    }
    load();
    return () => {
      live = false;
    };
  }, [id]);

  const isResolved = useMemo(
    () => row?.status?.toLowerCase() === "resolved",
    [row]
  );

  const plateError = useMemo(() => {
    if (!plate) return null;
    return PLATE_REGEX.test(plate.trim())
      ? null
      : "Format must be ABC 123 or ABC 1234";
  }, [plate]);

  const contactError = useMemo(() => {
    if (!contactNo) return null; // optional, but if present must be valid
    return PHONE_REGEX.test(contactNo)
      ? null
      : "Must be an 11-digit PH number starting with 09 (e.g., 09271351640).";
  }, [contactNo]);

  function onPlateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPlate(normalizePlate(e.target.value));
  }

  async function handleResolve() {
    setError(null);
    if (!row) return;

    // 1. Validate and normalize plate
    const nextPlate = normalizePlate(plate).trim();

    if (!nextPlate) {
      setError("Please enter a license plate before resolving.");
      return;
    }
    if (!PLATE_REGEX.test(nextPlate)) {
      setError("Invalid plate format. Use ABC 123 or ABC 1234.");
      return;
    }

    // 2. Validate contact number (optional, but if present must be valid)
    const cleanedContact = contactNo ? contactNo.replace(/[^0-9]/g, "") : "";
    if (cleanedContact && !PHONE_REGEX.test(cleanedContact)) {
      setError(
        "Invalid contact number. Must be 11 digits and start with 09 (e.g., 09271351640)."
      );
      return;
    }

    const trimmedName = violatorName.trim() || null;
    const trimmedAddress = address.trim() || null;
    const trimmedContact = cleanedContact || null;
    const trimmedNote = note.trim() || null;

    setSaving(true);

    try {
      let violatorId = row.violator_id ?? null;

      // --------------------------------------------------
      // 3. CREATE / UPDATE VIOLATOR RECORD
      // --------------------------------------------------
      if (violatorId) {
        const { error: updateErr } = await supabase
          .from("violators")
          .update({
            full_name: trimmedName,
            license_plate: nextPlate,
            address: trimmedAddress,
            contact_no: trimmedContact,
            has_orcr: hasOrCr,
            has_driver_license: hasLicense,
            note: trimmedNote,
            updated_at: new Date().toISOString(),
          })
          .eq("id", violatorId);

        if (updateErr) {
          console.error("violators update error", updateErr);
          setError(
            `Failed to create or update violator record: ${updateErr.message}`
          );
          return;
        }
      } else {
        // no violator_id yet → try find by plate
        const { data: existing, error: findErr } = await supabase
          .from("violators")
          .select("*")
          .eq("license_plate", nextPlate)
          .maybeSingle();

        if (findErr) {
          console.error("violators lookup error", findErr);
          setError(
            `Failed to create or update violator record: ${findErr.message}`
          );
          return;
        }

        if (existing) {
          violatorId = existing.id;
          const { error: updateErr } = await supabase
            .from("violators")
            .update({
              full_name: trimmedName ?? existing.full_name,
              address: trimmedAddress ?? existing.address,
              contact_no: trimmedContact ?? existing.contact_no,
              has_orcr: hasOrCr,
              has_driver_license: hasLicense,
              note: trimmedNote ?? existing.note,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (updateErr) {
            console.error("violators update existing error", updateErr);
            setError(
              `Failed to create or update violator record: ${updateErr.message}`
            );
            return;
          }
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from("violators")
            .insert({
              full_name: trimmedName,
              license_plate: nextPlate,
              address: trimmedAddress,
              contact_no: trimmedContact,
              has_orcr: hasOrCr,
              has_driver_license: hasLicense,
              note: trimmedNote,
            })
            .select()
            .single();

          if (insertErr) {
            console.error("violators insert error", insertErr);
            setError(
              `Failed to create or update violator record: ${insertErr.message}`
            );
            return;
          }

          violatorId = inserted.id;
        }
      }

      // --------------------------------------------------
      // 4. UPDATE VIOLATION RECORD
      // --------------------------------------------------
      const { data: violationData, error: violationErr } = await supabase
        .from("violations")
        .update({
          license_plate: nextPlate,
          violator_name: trimmedName,
          violator_id: violatorId,
          status: "resolved",
        })
        .eq("id", row.id)
        .select()
        .single();

      if (violationErr) {
        console.error("violations update error", violationErr);
        setError(`Failed to save violation record: ${violationErr.message}`);
        return;
      }

      // 5. Sync local state
      setRow(violationData as Violation);
      setPlate(nextPlate);
      setViolatorName(trimmedName ?? "");
    } finally {
      setSaving(false);
    }
  }

  // ---------- rendering ----------
  if (loading)
    return (
      <div className="min-h-screen px-4 py-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 text-sm"
        >
          Back
        </button>
        <div className="mt-6 text-sm text-gray-500">Loading violation…</div>
      </div>
    );

  if (!row)
    return (
      <div className="min-h-screen px-4 py-4">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 text-sm"
        >
          Back
        </button>
        <div className="mt-6 text-sm text-red-600">
          {error ?? "Violation not found."}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen px-4 py-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 text-sm bg-white"
        >
          Back
        </button>
        <h1 className="text-lg font-semibold">Violation</h1>
        <div className="w-[64px]" />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl">
        {row.image_url ? (
          <img
            src={row.image_url}
            alt="evidence"
            className="w-full h-52 object-cover"
          />
        ) : (
          <div className="w-full h-52 grid place-items-center bg-gray-100 text-gray-500 text-sm">
            No Image
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
        <FieldRow label="Violation Type" value={cap(row.violation_type)} />
        <FieldRow label="Street" value={row.street_name ?? "—"} />
        <FieldRow label="Vehicle Type" value={cap(row.vehicle_class)} />
        <FieldRow label="Timestamp" value={fmtDate(row.timestamp)} />
        <FieldRow
          label="Status"
          value={cap(row.status)}
          valueClass={
            isResolved ? "text-green-600 font-medium" : "text-orange-600 font-medium"
          }
        />

        {/* Violator Name */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">
            Violator Name
          </label>
          <input
            value={violatorName}
            onChange={(e) => setViolatorName(e.target.value)}
            placeholder="e.g., Juan Dela Cruz"
            className={`w-full rounded-xl border p-3 text-sm ${
              violatorName &&
              !/^[A-Za-zÀ-ÖØ-öø-ÿÑñ'.\-\s]{2,80}$/.test(violatorName)
                ? "border-red-400 focus:ring-red-200"
                : "border-gray-300"
            }`}
            maxLength={80}
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
          />
          {violatorName &&
            !/^[A-Za-zÀ-ÖØ-öø-ÿÑñ'.\-\s]{2,80}$/.test(violatorName) && (
              <div className="mt-1 text-xs text-red-600">
                Use only letters, spaces, dot, hyphen, and apostrophe (2–80
                chars).
              </div>
            )}
        </div>

        {/* License Plate */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">
            License Plate
          </label>
          <input
            value={plate}
            onChange={onPlateChange}
            placeholder="ABC 1234"
            className={`w-full rounded-xl border p-3 text-sm uppercase ${
              plate && plateError
                ? "border-red-400 focus:ring-red-200"
                : "border-gray-300"
            }`}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={8}
            inputMode="text"
            title="Format: ABC 123 or ABC 1234"
          />
          {plate && plateError && (
            <div className="mt-1 text-xs text-red-600">{plateError}</div>
          )}
        </div>

        {/* Address */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="House / Block / Street, Barangay, City"
            className="w-full rounded-xl border border-gray-300 p-3 text-sm"
            maxLength={200}
            autoCapitalize="sentences"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        {/* Contact Number */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">
            Contact Number
          </label>
          <input
            value={contactNo}
            onChange={(e) => {
              const val = e.target.value.replace(/[^0-9]/g, "");
              setContactNo(val);
            }}
            placeholder="09171234567"
            className={`w-full rounded-xl border p-3 text-sm ${
              contactNo && contactError
                ? "border-red-400 focus:ring-red-200"
                : "border-gray-300"
            }`}
            maxLength={11}
            inputMode="numeric"
            autoCorrect="off"
            spellCheck={false}
          />
          {contactNo && contactError && (
            <div className="mt-1 text-xs text-red-600">{contactError}</div>
          )}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">
            Notes (optional, max 500 characters)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="Additional details, driver remarks, plate visibility issues, etc."
            className="w-full rounded-xl border border-gray-300 p-3 text-sm resize-none"
            rows={4}
            maxLength={500}
            autoCorrect="on"
            spellCheck={true}
          />
          <div className="text-right text-[11px] text-gray-400 mt-1">
            {note.length}/500
          </div>
        </div>

        {/* Documents Presented */}
        <div className="mt-4">
          <span className="block text-xs text-gray-500 mb-1">
            Documents Presented
          </span>
          <div className="flex items-center gap-4 text-xs">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={hasOrCr}
                onChange={(e) => setHasOrCr(e.target.checked)}
              />
              <span>OR / CR</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={hasLicense}
                onChange={(e) => setHasLicense(e.target.checked)}
              />
              <span>Driver&apos;s License</span>
            </label>
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
      </div>

      {/* Single action button */}
      <button
        onClick={handleResolve}
        disabled={
          saving ||
          !plate ||
          !!plateError ||
          (contactNo && !!contactError)
        }
        className={`mt-4 w-full rounded-2xl px-4 py-4 text-white font-semibold transition ${
          saving ||
          !plate ||
          !!plateError ||
          (contactNo && !!contactError)
            ? "bg-orange-300 cursor-not-allowed"
            : "bg-orange-600 hover:bg-orange-700"
        }`}
      >
        {saving ? "Saving…" : "Mark as Resolved"}
      </button>
    </div>
  );
}

function FieldRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="py-3 border-b last:border-b-0 border-gray-100">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500">{label}</div>
        <div className={`text-sm ${valueClass ?? ""}`}>{value}</div>
      </div>
    </div>
  );
}