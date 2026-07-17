// Pure date-range logic for the /setting stats period picker. Kept dependency-free
// (native Date/UTC math) — no react-day-picker/date-fns needed for a two-month grid
// and a handful of presets.

export type DateRange = { from: string; to: string };

export const PRESET_LABELS: Record<string, string> = {
  all: "Tout l'historique",
  "current-month": "Mois en cours",
  "last-30-days": "30 derniers jours",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function endOfMonthUtc(year: number, month: number): Date {
  return new Date(Date.UTC(year, month + 1, 0));
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

// Returns null for "all time" (no filter applied).
export function resolveDateRange(
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined
): DateRange | null {
  const today = todayUtc();

  if (preset === "current-month") {
    return {
      from: toIsoDate(startOfMonthUtc(today.getUTCFullYear(), today.getUTCMonth())),
      to: toIsoDate(today),
    };
  }

  if (preset === "last-30-days") {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - 29);
    return { from: toIsoDate(start), to: toIsoDate(today) };
  }

  if (preset?.startsWith("month:")) {
    const match = /^month:(\d{4})-(\d{2})$/.exec(preset);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      return {
        from: toIsoDate(startOfMonthUtc(year, month)),
        to: toIsoDate(endOfMonthUtc(year, month)),
      };
    }
  }

  if (preset === "custom" && from && to && isValidIsoDate(from) && isValidIsoDate(to) && from <= to) {
    return { from, to };
  }

  return null;
}

// Same-length window immediately preceding `range`, for a "vs previous period"
// comparison on the stat tiles.
export function previousEquivalentRange(range: DateRange): DateRange {
  const fromDate = new Date(`${range.from}T00:00:00Z`);
  const toDate = new Date(`${range.to}T00:00:00Z`);
  const lengthDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

  const previousTo = new Date(fromDate);
  previousTo.setUTCDate(previousTo.getUTCDate() - 1);
  const previousFrom = new Date(previousTo);
  previousFrom.setUTCDate(previousFrom.getUTCDate() - (lengthDays - 1));

  return { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) };
}

export type MonthOption = { preset: string; label: string };

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Previous full calendar months, most recent first, excluding the current month
// (already covered by the "current-month" preset).
export function previousMonthOptions(count: number, referenceDate = todayUtc()): MonthOption[] {
  const options: MonthOption[] = [];
  for (let i = 1; i <= count; i++) {
    const date = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - i, 1));
    const key = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
    const label = capitalize(
      date.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })
    );
    options.push({ preset: `month:${key}`, label });
  }
  return options;
}

export function formatDisplayDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatRangeDates(range: DateRange): string {
  return `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}`;
}

// Full label shown on the trigger button, e.g. "30 derniers jours : 17 juin 2026 – 16 juil. 2026".
export function formatTriggerLabel(
  preset: string,
  range: DateRange | null,
  monthOptions: MonthOption[]
): string {
  if (!range) return PRESET_LABELS.all;
  if (preset === "custom") return formatRangeDates(range);

  const knownLabel =
    PRESET_LABELS[preset] ?? monthOptions.find((option) => option.preset === preset)?.label;
  return knownLabel ? `${knownLabel} : ${formatRangeDates(range)}` : formatRangeDates(range);
}
