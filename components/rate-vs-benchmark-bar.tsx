import { formatPercent } from "@/lib/setting/funnel";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Literal double-bar comparison: your rate (coral) vs benchmark (gray),
// both values labeled — a simpler, single-value visual than the existing
// 3-tier BenchmarkMeter/TileBenchmarkStrip (which stay on the Funnel).
export function RateVsBenchmarkBar({
  currentRate,
  benchmarkRate,
  compact = false,
}: {
  currentRate: number | null;
  benchmarkRate: number;
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("common.shared");
  if (currentRate === null) {
    return <p className="text-xs text-muted-foreground">{t("notEnoughVolume")}</p>;
  }

  const currentPct = Math.min(Math.max(currentRate, 0), 1) * 100;
  const benchmarkPct = Math.min(Math.max(benchmarkRate, 0), 1) * 100;
  const barHeight = compact ? "h-1.5" : "h-2.5";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-signal">{t("you")}</span>
        <span className="font-bold">{formatPercent(currentRate, locale)}</span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", barHeight)}>
        <div className="h-full rounded-full bg-signal" style={{ width: `${currentPct}%` }} />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold text-muted-foreground">{t("benchmark")}</span>
        <span className="font-bold text-muted-foreground">{formatPercent(benchmarkRate, locale)}</span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-muted", barHeight)}>
        <div className="h-full rounded-full bg-muted-foreground/50" style={{ width: `${benchmarkPct}%` }} />
      </div>
    </div>
  );
}
