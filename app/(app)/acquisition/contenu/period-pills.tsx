"use client";

import { InfoPopover } from "@/components/info-popover";
import { useTranslations } from "next-intl";
import { DATE_FILTERS, type DateFilterKey } from "@/lib/content-posts/period-filter";
import { VIDEO_FORMATS, type VideoFormat } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

// Extracted from the old single-page contenu-view.tsx when Contenu was split
// into an overview page + one sub-page per platform — both sub-pages drive
// their KPI tiles AND their table from the same period selection, so this
// stays one shared control rather than a copy in each view.
export function PeriodPills({ period, onChange }: { period: DateFilterKey; onChange: (key: DateFilterKey) => void }) {
  const t = useTranslations("content");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">{t("period")}</span>
      {DATE_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onChange(filter.key)}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            period === filter.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {t(`period${filter.key === "7d" ? "7d" : filter.key === "30d" ? "30d" : filter.key === "3m" ? "3m" : "All"}`)}
        </button>
      ))}
    </div>
  );
}

// YouTube-only — Instagram has no equivalent format split. Shorts and
// long-form have wildly different view/retention baselines, so mixing them
// into the same averages/ranking is misleading either way.
export function FormatPills({ format, onChange }: { format: VideoFormat; onChange: (key: VideoFormat) => void }) {
  const t = useTranslations("content");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">{t("format")}</span>
      {VIDEO_FORMATS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "inline-flex min-h-11 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            format === option.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {t(`format${option.key === "all" ? "All" : option.key === "short" ? "Short" : "Long"}`)}
        </button>
      ))}
      <InfoPopover text={t("formatHelp")} />
    </div>
  );
}
