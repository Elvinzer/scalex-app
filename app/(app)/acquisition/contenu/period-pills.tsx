"use client";

import { InfoPopover } from "@/components/info-popover";
import { DATE_FILTERS, type DateFilterKey } from "@/lib/content-posts/period-filter";
import { VIDEO_FORMATS, type VideoFormat } from "@/lib/youtube/format";
import { cn } from "@/lib/utils";

// Extracted from the old single-page contenu-view.tsx when Contenu was split
// into an overview page + one sub-page per platform — both sub-pages drive
// their KPI tiles AND their table from the same period selection, so this
// stays one shared control rather than a copy in each view.
export function PeriodPills({ period, onChange }: { period: DateFilterKey; onChange: (key: DateFilterKey) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">Période :</span>
      {DATE_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onChange(filter.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            period === filter.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

// YouTube-only — Instagram has no equivalent format split. Shorts and
// long-form have wildly different view/retention baselines, so mixing them
// into the same averages/ranking is misleading either way.
export function FormatPills({ format, onChange }: { format: VideoFormat; onChange: (key: VideoFormat) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-bold text-muted-foreground">Format :</span>
      {VIDEO_FORMATS.map((option) => (
        <button
          key={option.key}
          type="button"
          onClick={() => onChange(option.key)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-bold transition-all",
            format === option.key
              ? "border-accent-border bg-accent-soft text-accent-text"
              : "border-border text-muted-foreground hover:border-border-hover"
          )}
        >
          {option.label}
        </button>
      ))}
      <InfoPopover text="YouTube ne fournit aucun indicateur officiel « Short » via son API. On classe comme Short toute vidéo de 2min ou moins - une vidéo longue publiée au format court peut être mal classée." />
    </div>
  );
}
