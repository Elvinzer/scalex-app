// Locale-aware numeric parsing shared by import code and CRM normalization.
// Keep this module dependency-free: client bundles can use it without pulling
// in ExcelJS, PapaParse, or the PDF parser.
export function parseLocaleNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/[€$£\s]/g, "");
  if (trimmed === "") return null;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  let normalized = trimmed;

  if (hasComma && hasDot) {
    // Whichever separator appears LAST is the decimal separator.
    normalized = trimmed.lastIndexOf(",") > trimmed.lastIndexOf(".") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed.replace(/,/g, "");
  } else if (hasComma) {
    // Single comma with exactly 2 trailing digits = decimal (FR); otherwise
    // a thousands separator.
    normalized = /,\d{1,2}$/.test(trimmed) ? trimmed.replace(",", ".") : trimmed.replace(/,/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
