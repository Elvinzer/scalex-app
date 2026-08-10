import { getLocale, getTranslations } from "next-intl/server";

import { compareToBand, getBenchmark, type SectorKey } from "@/lib/benchmarks";
import type { ClosingBottleneck } from "@/lib/closing/metrics";
import { formatPercent } from "@/lib/setting/funnel";

// Only showUpRate has a market benchmark (the market JSON has no numeric
// band for closing rate) — closingRate just gets the generic tip, no
// benchmark line, same pattern as Setting's outreach/proposal stages.
function benchmarkBandForStage(stage: ClosingBottleneck["stage"], sector: SectorKey | null) {
  if (stage !== "showUpRate") return null;
  return getBenchmark(sector).showUpRate;
}

export async function ClosingBottleneckCard({
  bottleneck,
  sector,
}: {
  bottleneck: ClosingBottleneck | null;
  sector: SectorKey | null;
}) {
  const locale = await getLocale();
  const t = await getTranslations("sales.closingFunnel");
  if (!bottleneck) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">{t("notEnough")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("notEnoughHelp")}</p>
      </div>
    );
  }

  const percent = Math.round(bottleneck.rate * 100);
  const band = benchmarkBandForStage(bottleneck.stage, sector);
  const comparison = compareToBand(bottleneck.rate, band);

  return (
    <div className="sticker-spotlight px-7 py-6">
      <p className="text-xs text-mist/70">{t("friction")}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="text-xl font-bold tracking-[-0.01em]">{t(`stages.${bottleneck.stage}`)}</h2>
        <span className="text-xl font-bold tabular-nums text-negative">{percent}%</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-mist/70">
        {t(`tips.${bottleneck.stage}`)}
      </p>
      {comparison === "below" && band && (
        <p className="mt-2 max-w-2xl text-sm text-mist/70">
          {t("belowMarket", { value: formatPercent(band.bas, locale) })}
        </p>
      )}
    </div>
  );
}
