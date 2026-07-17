import { compareToBand, getBenchmark, type SectorKey } from "@/lib/benchmarks";
import { CLOSING_STAGE_LABELS, CLOSING_STAGE_TIPS, type ClosingBottleneck } from "@/lib/closing/metrics";
import { formatPercent } from "@/lib/setting/funnel";

// Only showUpRate has a market benchmark (the market JSON has no numeric
// band for closing rate) — closingRate just gets the generic tip, no
// benchmark line, same pattern as Setting's outreach/proposal stages.
function benchmarkBandForStage(stage: ClosingBottleneck["stage"], sector: SectorKey | null) {
  if (stage !== "showUpRate") return null;
  return getBenchmark(sector).showUpRate;
}

export function ClosingBottleneckCard({
  bottleneck,
  sector,
}: {
  bottleneck: ClosingBottleneck | null;
  sector: SectorKey | null;
}) {
  if (!bottleneck) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Pas encore assez de données</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoute quelques jours de suite pour voir apparaître ton point de friction
          prioritaire.
        </p>
      </div>
    );
  }

  const percent = Math.round(bottleneck.rate * 100);
  const band = benchmarkBandForStage(bottleneck.stage, sector);
  const comparison = compareToBand(bottleneck.rate, band);

  return (
    <div className="sticker-spotlight p-8">
      <p className="text-sm font-bold text-signal">Ton plus gros point de friction</p>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="text-2xl font-bold">{CLOSING_STAGE_LABELS[bottleneck.stage]}</h2>
        <span className="font-display text-2xl font-bold tabular-nums text-state-critical">
          {percent}%
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-mist/70">
        {CLOSING_STAGE_TIPS[bottleneck.stage]}
      </p>
      {comparison === "below" && band && (
        <p className="mt-2 max-w-2xl text-sm text-mist/70">
          C&apos;est aussi en dessous du repère bas du marché ({formatPercent(band.bas)}) — c&apos;est
          probablement ta priorité numéro un.
        </p>
      )}
    </div>
  );
}
