import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import type { MetricStatus } from "@/lib/diagnostic/cascade";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

// Shared shape between lib/diagnostic/cascade.ts's MetricSummary
// (Setting/Closing) and lib/diagnostic/content-metrics.ts's
// ContentMetricSummary (Contenu) — both are "one pillar metric vs its
// benchmark", extracted here so /diagnostic and /overview render the exact
// same card instead of two copies.
export type MetricSummaryLike = {
  key: string;
  category: string;
  label: string;
  status: MetricStatus;
  currentRatePercent: number | null;
  benchmarkRatePercent: number;
};

export const STATUS_ICON: Record<MetricStatus, string> = { ok: "✅", caution: "⚠️", critical: "❌", unmeasured: "❓" };
export const STATUS_BADGE: Record<MetricStatus, string> = {
  ok: "bg-state-healthy-bg text-state-healthy",
  caution: "bg-state-caution-bg text-state-caution",
  critical: "bg-state-critical-bg text-state-critical",
  unmeasured: "bg-muted text-muted-foreground",
};

export function MetricSummaryCard({
  summary,
  measureHint,
  measureHintHref,
  measureHintLabel,
}: {
  summary: MetricSummaryLike;
  // Only shown when status === "unmeasured" — where/how to start measuring
  // this pillar (differs per metric: Datas for the cascade, Contenu for
  // content metrics).
  measureHint: string;
  measureHintHref: string;
  measureHintLabel: string;
}) {
  const t = useTranslations("diagnostic");
  return (
    <div id={`metric-${summary.key}`} className="sticker-card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{summary.label}</p>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[summary.status])}>
          {STATUS_ICON[summary.status]}
        </span>
      </div>
      {summary.status === "unmeasured" ? (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
              {t("notMeasured")}
            </button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-muted-foreground">{measureHint}</p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <a href={measureHintHref}>{measureHintLabel}</a>
            </Button>
          </PopoverContent>
        </Popover>
      ) : (
        <div className="mt-3">
          <RateVsBenchmarkBar
            currentRate={summary.currentRatePercent === null ? null : summary.currentRatePercent / 100}
            benchmarkRate={summary.benchmarkRatePercent / 100}
            compact
          />
        </div>
      )}
    </div>
  );
}
