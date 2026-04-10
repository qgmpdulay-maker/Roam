import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Violation = {
  id: string;
  image_url: string | null;
  violation_type: string | null;
  street_name: string | null;
  vehicle_class: string | null;
  timestamp: string | null;
  status: string | null;

  license_plate: string | null;
  violator_name: string | null;
  violator_id: string | null;

  violator_image_url?: string | null;

  resolved_by?: string | null;
  resolved_at?: string | null;
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

const PLATE_REGEX = /^[A-Z]{3}\s\d{3,4}$/;
const PHONE_REGEX = /^09\d{9}$/;

function normalizePlate(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const letters = raw.slice(0, 3).replace(/[^A-Z]/g, "");
  const digits = raw.slice(3).replace(/\D/g, "").slice(0, 4);
  if (!letters) return "";
  return digits ? `${letters} ${digits}` : letters;
}

function safeFilename(name: string) {
  return String(name ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

const NOTE_OPTIONS = [
  "",
  "Warning issued",
  "Driver instructed to move vehicle",
  "Owner contacted and informed",
  "Repeat violation recorded",
  "Referred to OPSS",
  "For towing",
  "Resolved on site",
] as const;

const inputClass =
  "w-full rounded-xl border p-3 text-sm bg-white text-gray-900 border-gray-300 placeholder-gray-400 dark:bg-gray-800 dark:text-white dark:border-gray-700 dark:placeholder-gray-400 outline-none";
const labelClass = "block text-xs text-gray-500 dark:text-gray-400 mb-1";

export default function ViolationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const VIOLATIONS_LIST_ROUTE = "/violations";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [row, setRow] = useState<Violation | null>(null);

  const [violatorName, setViolatorName] = useState("");
  const [plate, setPlate] = useState("");

  const [address, setAddress] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [hasOrCr, setHasOrCr] = useState(false);
  const [hasLicense, setHasLicense] = useState(false);
  const [note, setNote] = useState("");

  const EVIDENCE_BUCKET = "violation_evidence";

  const [violatorFile, setViolatorFile] = useState<File | null>(null);
  const [violatorPreview, setViolatorPreview] = useState<string>("");

  const [violatorImgUrl, setViolatorImgUrl] = useState<string>("");

  useEffect(() => {
    if (!violatorFile) {
      setViolatorPreview("");
      return;
    }
    const u = URL.createObjectURL(violatorFile);
    setViolatorPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [violatorFile]);

  async function uploadToBucket(file: File, path: string) {
    const { error: upErr } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .upload(path, file, { cacheControl: "3600", upsert: true });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(EVIDENCE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadViolatorNow() {
    if (!row?.id || !violatorFile) return;
    setError(null);
    setUploading(true);

    try {
      const path = `violations/${row.id}/violator_${Date.now()}_${safeFilename(
        violatorFile.name
      )}`;
      const url = await uploadToBucket(violatorFile, path);

      const { data, error: uErr } = await supabase
        .from("violations")
        .update({ violator_image_url: url })
        .eq("id", row.id)
        .select("*")
        .single();

      if (uErr) throw uErr;

      setRow(data as Violation);
      setViolatorImgUrl(url);
      setViolatorFile(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to upload violator photo.");
    } finally {
      setUploading(false);
    }
  }

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

      setViolatorImgUrl(v.violator_image_url ?? "");

      if (v.violator_id) {
        const { data: violator, error: violatorErr } = await supabase
          .from("violators")
          .select(
            "full_name, license_plate, address, contact_no, has_orcr, has_driver_license, note"
          )
          .eq("id", v.violator_id)
          .maybeSingle();

        if (!violatorErr && violator) {
          if ((violator as any).full_name && !v.violator_name) {
            setViolatorName((violator as any).full_name);
          }

          if ((violator as any).license_plate && !v.license_plate) {
            setPlate(normalizePlate((violator as any).license_plate));
          }

          setAddress((violator as any).address ?? "");
          setContactNo(
            String((violator as any).contact_no ?? "").replace(/[^0-9]/g, "")
          );
          setHasOrCr(Boolean((violator as any).has_orcr));
          setHasLicense(Boolean((violator as any).has_driver_license));
          setNote((violator as any).note ?? "");
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
    if (!contactNo) return null;
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

    if (row.status?.toLowerCase() === "resolved") {
      setError("This violation is already resolved.");
      return;
    }

    const nextPlate = normalizePlate(plate).trim();
    if (!nextPlate) {
      return setError("Please enter a license plate before resolving.");
    }
    if (!PLATE_REGEX.test(nextPlate)) {
      return setError("Invalid plate format. Use ABC 123 or ABC 1234.");
    }

    const cleanedContact = contactNo ? contactNo.replace(/[^0-9]/g, "") : "";
    if (cleanedContact && !PHONE_REGEX.test(cleanedContact)) {
      return setError(
        "Invalid contact number. Must be 11 digits and start with 09 (e.g., 09271351640)."
      );
    }

    const trimmedName = violatorName.trim() || null;
    const trimmedAddress = address.trim() || null;
    const trimmedContact = cleanedContact || null;
    const trimmedNote = note.trim() || null;

    setSaving(true);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      const user = authData?.user;
      if (authErr || !user) {
        setError("You must be logged in to resolve a violation.");
        return;
      }

      let nextViolatorImgUrl = violatorImgUrl || null;
      if (violatorFile) {
        setUploading(true);
        const path = `violations/${row.id}/violator_${Date.now()}_${safeFilename(
          violatorFile.name
        )}`;
        nextViolatorImgUrl = await uploadToBucket(violatorFile, path);
      }

      let violatorId = row.violator_id ?? null;

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
          console.error(updateErr);
          setError(
            `Failed to create or update violator record: ${updateErr.message}`
          );
          return;
        }
      } else {
        const { data: existing, error: findErr } = await supabase
          .from("violators")
          .select("*")
          .eq("license_plate", nextPlate)
          .maybeSingle();

        if (findErr) {
          console.error(findErr);
          setError(
            `Failed to create or update violator record: ${findErr.message}`
          );
          return;
        }

        if (existing) {
          violatorId = (existing as any).id;
          const { error: updateErr } = await supabase
            .from("violators")
            .update({
              full_name: trimmedName ?? (existing as any).full_name,
              address: trimmedAddress ?? (existing as any).address,
              contact_no: trimmedContact ?? (existing as any).contact_no,
              has_orcr: hasOrCr,
              has_driver_license: hasLicense,
              note: trimmedNote ?? (existing as any).note,
              updated_at: new Date().toISOString(),
            })
            .eq("id", (existing as any).id);

          if (updateErr) {
            console.error(updateErr);
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
            console.error(insertErr);
            setError(
              `Failed to create or update violator record: ${insertErr.message}`
            );
            return;
          }

          violatorId = (inserted as any).id;
        }
      }

      const { data: violationData, error: violationErr } = await supabase
        .from("violations")
        .update({
          license_plate: nextPlate,
          violator_name: trimmedName,
          violator_id: violatorId,
          status: "resolved",
          resolved_by: user.id,
          resolved_at: new Date().toISOString(),
          violator_image_url: nextViolatorImgUrl,
        })
        .eq("id", row.id)
        .select()
        .single();

      if (violationErr) {
        console.error(violationErr);
        setError(`Failed to save violation record: ${violationErr.message}`);
        return;
      }

      const updated = violationData as Violation;
      setRow(updated);
      setPlate(nextPlate);
      setViolatorName(trimmedName ?? "");
      setViolatorImgUrl(updated.violator_image_url ?? (nextViolatorImgUrl ?? ""));
      setViolatorFile(null);

      navigate(VIOLATIONS_LIST_ROUTE, {
        replace: true,
        state: { justResolvedId: row.id },
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to resolve violation.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen px-4 py-4 text-gray-900 dark:text-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-white"
        >
          Back
        </button>
        <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          Loading violation…
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen px-4 py-4 text-gray-900 dark:text-gray-100">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-white"
        >
          Back
        </button>
        <div className="mt-6 text-sm text-red-600">
          {error ?? "Violation not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-4 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="rounded-full px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm bg-white dark:bg-gray-900 dark:text-white"
        >
          Back
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Violation
        </h1>
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
          <div className="w-full h-52 grid place-items-center bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">
            No Image
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <FieldRow label="Violation Type" value={cap(row.violation_type)} />
        <FieldRow label="Street" value={row.street_name ?? "—"} />
        <FieldRow label="Vehicle Type" value={cap(row.vehicle_class)} />
        <FieldRow label="Timestamp" value={fmtDate(row.timestamp)} />
        <FieldRow
          label="Status"
          value={cap(row.status)}
          valueClass={
            isResolved
              ? "text-green-600 font-medium"
              : "text-orange-600 font-medium"
          }
        />

        <div className="mt-4 rounded-2xl border border-gray-200 dark:border-gray-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Violator photo
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Capture the violator
              </div>
            </div>
            {violatorImgUrl ? (
              <a
                href={violatorImgUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-orange-600 font-semibold"
              >
                View
              </a>
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                No upload
              </span>
            )}
          </div>

          <div className="mt-3">
            {violatorPreview || violatorImgUrl ? (
              <img
                src={violatorPreview || violatorImgUrl}
                alt="Violator preview"
                className="h-40 w-full rounded-xl object-cover bg-gray-50 dark:bg-gray-800"
              />
            ) : (
              <div className="h-40 w-full rounded-xl bg-gray-50 dark:bg-gray-800 grid place-items-center text-xs text-gray-400 dark:text-gray-500">
                No violator photo selected
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              id="violator-photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setViolatorFile(e.target.files?.[0] ?? null)}
            />
            <label
              htmlFor="violator-photo"
              className="flex-1 text-center rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Take photo
            </label>

            <button
              type="button"
              onClick={() => setViolatorFile(null)}
              className="rounded-xl border border-gray-300 dark:border-gray-700 px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-900 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              disabled={!violatorFile}
            >
              Clear
            </button>

            <button
              type="button"
              onClick={uploadViolatorNow}
              className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              disabled={!violatorFile || uploading || saving}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Violator Name</label>
          <input
            value={violatorName}
            onChange={(e) => setViolatorName(e.target.value)}
            placeholder="e.g., Juan Dela Cruz"
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            maxLength={80}
          />
        </div>

        <div className="mt-4">
          <label className={labelClass}>License Plate</label>
          <input
            value={plate}
            onChange={onPlateChange}
            placeholder="ABC 1234"
            className={`${inputClass} uppercase ${
              plate && plateError
                ? "border-red-400 dark:border-red-500"
                : "border-gray-300 dark:border-gray-700"
            }`}
            style={{ WebkitTextFillColor: "currentColor" }}
            maxLength={8}
            inputMode="text"
          />
          {plate && plateError && (
            <div className="mt-1 text-xs text-red-600">{plateError}</div>
          )}
        </div>

        <div className="mt-4">
          <label className={labelClass}>Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={inputClass}
            style={{ WebkitTextFillColor: "currentColor" }}
            maxLength={200}
          />
        </div>

        <div className="mt-4">
          <label className={labelClass}>Contact Number</label>
          <input
            value={contactNo}
            onChange={(e) => setContactNo(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="09171234567"
            className={`${inputClass} ${
              contactNo && contactError
                ? "border-red-400 dark:border-red-500"
                : "border-gray-300 dark:border-gray-700"
            }`}
            style={{ WebkitTextFillColor: "currentColor" }}
            maxLength={11}
            inputMode="numeric"
          />
          {contactNo && contactError && (
            <div className="mt-1 text-xs text-red-600">{contactError}</div>
          )}
        </div>

        <div className="mt-4">
          <label className={labelClass}>Officer Remark</label>
          <select
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} h-12 text-base`}
            style={{ WebkitTextFillColor: "currentColor" }}
          >
            <option value="">Select a remark</option>
            {NOTE_OPTIONS.filter((option) => option).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <span className={labelClass}>Documents Presented</span>
          <div className="flex items-center gap-4 text-xs text-gray-700 dark:text-gray-300">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                checked={hasOrCr}
                onChange={(e) => setHasOrCr(e.target.checked)}
              />
              <span>OR / CR</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                checked={hasLicense}
                onChange={(e) => setHasLicense(e.target.checked)}
              />
              <span>Driver&apos;s License</span>
            </label>
          </div>
        </div>

        {error && <div className="mt-3 text-xs text-red-600">{error}</div>}
      </div>

      <button
        onClick={handleResolve}
        disabled={
          saving ||
          uploading ||
          !plate ||
          !!plateError ||
          (contactNo && !!contactError)
        }
        className={`mt-4 w-full rounded-2xl px-4 py-4 text-white font-semibold transition ${
          saving || uploading || !plate || !!plateError || (contactNo && !!contactError)
            ? "bg-orange-300 cursor-not-allowed"
            : "bg-orange-600 hover:bg-orange-700"
        }`}
      >
        {saving ? "Saving…" : uploading ? "Uploading…" : "Mark as Resolved"}
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
    <div className="py-3 border-b last:border-b-0 border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
        <div className={`text-sm text-gray-900 dark:text-gray-100 ${valueClass ?? ""}`}>
          {value}
        </div>
      </div>
    </div>
  );
}