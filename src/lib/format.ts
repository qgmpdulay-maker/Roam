/**
 * Generic title-case that:
 * - Capitalizes every word
 * - Leaves all-uppercase acronyms we explicitly "keep" (e.g., UV, SUV)
 * - Trims and collapses extra spaces
 */
export function titleCase(input?: string | null, keep: string[] = []): string {
  if (!input) return "";
  const raw = String(input).trim().replace(/\s+/g, " ");
  const KEEP = new Set(keep.map(k => k.toUpperCase()));

  return raw
    .split(" ")
    .map((w) => {
      const upper = w.toUpperCase();
      if (KEEP.has(upper)) return upper;
      return w
        .split("-")
        .map(part =>
          part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part
        )
        .join("-");
    })
    .join(" ");
}

export function formatStatus(s?: string | null): string {
  const v = (s ?? "").toLowerCase();
  return v === "resolved" ? "Resolved" : "Pending";
}

export function formatVehicleClass(v?: string | null): string {
  const val = (v ?? "").trim().toLowerCase();
  if (!val) return "";
  if (val === "uv") return "UV";
  if (val === "suv") return "SUV";
  return titleCase(val);
}

export function formatViolationType(v?: string | null): string {
  return titleCase(v ?? "");
}

export function formatZoneName(v?: string | null): string {
  // Keep common initials; extend as you need.
  return titleCase(v ?? "", ["UV", "SUV", "J.P.", "JP", "F."]);
}
