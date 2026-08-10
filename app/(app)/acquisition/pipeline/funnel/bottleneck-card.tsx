import { compareToBand, getBenchmark, type SectorKey } from "@/lib/benchmarks";
import { formatPercent, type Bottleneck } from "@/lib/setting/funnel";
import { getLocale, getTranslations } from "next-intl/server";

// Only responseRate and bookingRate have a market benchmark to compare
// against (the market JSON doesn't cover an outreach or proposal rate) —
// other bottleneck stages just get the existing generic tip, no benchmark line.
function benchmarkBandForStage(stage: Bottleneck["stage"], sector: SectorKey | null) {
  const benchmark = getBenchmark(sector);
  if (stage === "responseRate") return benchmark.responseRate;
  if (stage === "bookingRate") return benchmark.bookingRate;
  return null;
}

export async function BottleneckCard({
  bottleneck,
  sector,
}: {
  bottleneck: Bottleneck | null;
  sector: SectorKey | null;
}) {
  const t = await getTranslations("pipeline.funnel");
  const locale = await getLocale();
  if (!bottleneck) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">{t("notEnough")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("notEnoughHelp")}
        </p>
      </div>
    );
  }

  const percent = Math.round(bottleneck.rate * 100);
  const band = benchmarkBandForStage(bottleneck.stage, sector);
  const comparison = compareToBand(bottleneck.rate, band);

  return (
    <div className="sticker-spotlight px-7 py-6">
      <p className="text-xs text-mist/70">{t("priorityFriction")}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="text-xl font-bold tracking-[-0.01em]">{t(bottleneck.stage)}</h2>
        <span className="text-xl font-bold tabular-nums text-negative">{percent}%</span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-mist/70">{t(`tips.${bottleneck.stage}`)}</p>
      {comparison === "below" && band && (
        <p className="mt-2 max-w-2xl text-sm text-mist/70">
          {t("belowMarket", { value: formatPercent(band.bas, locale), priority: t("priorityOne") })}
        </p>
      )}
    </div>
  );
}
