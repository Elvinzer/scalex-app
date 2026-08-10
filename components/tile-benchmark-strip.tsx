import { compareToBand, type BenchmarkBand } from "@/lib/benchmarks";
import { useTranslations } from "next-intl";

// Compact "vs marché" strip shown directly on a Setting/Closing stat tile —
// same 3-zone comparison as BenchmarkMeter (components/benchmark-meter.tsx),
// just slimmed down to fit under a tile's value instead of the accordion's
// full-width row. Renders nothing but an honest "no data yet" line when this
// exact ratio has no market band for the user's sector, per the addendum
// rule: never draw an empty or invented bar.
export function TileBenchmarkStrip({
  value,
  band,
  sublabel = "vs marché",
}: {
  value: number | null;
  band: BenchmarkBand;
  sublabel?: string;
}) {
  const t = useTranslations("common.shared");
  if (!band || value === null) {
    return (
      <p className="mt-3 text-[10.5px] text-muted-foreground italic">
        {t("noMarketBenchmark")}
      </p>
    );
  }

  const clampedValue = Math.min(Math.max(value, 0), 1);
  const criticalWidth = band.bas * 100;
  const cautionWidth = (band.moyen - band.bas) * 100;
  const healthyWidth = 100 - band.bas * 100 - cautionWidth;
  const comparison = compareToBand(value, band);

  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
        {sublabel === "vs marché" ? t("marketBenchmark") : sublabel}
      </p>
      <div className="relative h-1.5 overflow-hidden rounded-full">
        <div className="flex h-full">
          <div className="h-full bg-state-critical-bg" style={{ width: `${criticalWidth}%` }} />
          <div className="h-full bg-state-caution-bg" style={{ width: `${cautionWidth}%` }} />
          <div className="h-full bg-state-healthy-bg" style={{ width: `${healthyWidth}%` }} />
        </div>
        <div
          className="absolute -top-[3px] h-3 w-0.5 bg-ink"
          style={{ left: `${clampedValue * 100}%` }}
        />
      </div>
      {comparison && (
        <p className="mt-1 text-[10.5px] font-bold">{comparison === "below" ? t("belowMarket") : comparison === "above" ? t("aboveMarket") : t("withinMarket")}</p>
      )}
    </div>
  );
}
