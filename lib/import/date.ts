// Date normalization shared by import code and CRM normalization.
// Keep this module dependency-free so importing CRM server logic never loads
// the PDF parser (and its browser-only DOMMatrix dependency).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
const MIN_PLAUSIBLE_SERIAL = 1;
const MAX_PLAUSIBLE_SERIAL = 2958465;

export function excelSerialToDate(serial: number): Date {
  return new Date(EXCEL_EPOCH_MS + serial * 86400000);
}

export function normalizeDateCell(raw: string): { year: number; month: number; day: number } | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };

  const fr = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (fr) {
    const month = Number(fr[2]);
    let year = Number(fr[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12) return null;
    return { year, month, day: Number(fr[1]) };
  }

  if (/^\d+$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (serial >= MIN_PLAUSIBLE_SERIAL && serial <= MAX_PLAUSIBLE_SERIAL) {
      const date = excelSerialToDate(serial);
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    }
  }

  return null;
}

export function normalizeDateCellToIso(raw: string): string | null {
  const parsed = normalizeDateCell(raw);
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}
