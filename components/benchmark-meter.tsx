import type { BenchmarkBand } from "@/lib/benchmarks";
import { formatPercent } from "@/lib/setting/funnel";

// A horizontal 3-zone ruler (below "bas" / between "bas" and "moyen" / above
// "moyen", with a tick at "bon") and the user's actual rate plotted as a
// marker — the honest way to show "where do I stand vs the market" without
// implying more precision than these indicative figures actually carry.
export function BenchmarkMeter({
  label,
  value,
  band,
}: {
  label: string;
  value: number | null;
  band: BenchmarkBand;
}) {
  if (!band) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-muted-foreground">{label}</p>
          <p className="font-display text-lg font-bold">{value === null ? "—" : formatPercent(value)}</p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Pas de repère marché pour cette métrique sur ce secteur.
        </p>
      </div>
    );
  }

  if (value === null) {
    return (
      <div>
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
        <p className="mt-2 text-xs text-muted-foreground">Pas encore assez de données.</p>
      </div>
    );
  }

  const clampedValue = Math.min(Math.max(value, 0), 1);
  const criticalWidth = band.bas * 100;
  const cautionWidth = (band.moyen - band.bas) * 100;
  const healthyWidth = 100 - band.bas * 100 - cautionWidth;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
        <p className="font-display text-lg font-bold">{formatPercent(value)}</p>
      </div>

      <div className="relative mt-4 h-3">
        <div className="flex h-full overflow-hidden rounded-full border-2 border-ink">
          <div className="h-full bg-state-critical-bg" style={{ width: `${criticalWidth}%` }} />
          <div className="h-full bg-state-caution-bg" style={{ width: `${cautionWidth}%` }} />
          <div className="h-full bg-state-healthy-bg" style={{ width: `${healthyWidth}%` }} />
        </div>

        {/* "bon" reference tick */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-ink/40"
          style={{ left: `${band.bon * 100}%` }}
          title={`Repère "bon" du marché : ${formatPercent(band.bon)}`}
        />

        {/* user's actual rate */}
        <div
          className="absolute -top-1.5 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${clampedValue * 100}%` }}
        >
          <div className="h-6 w-0.5 bg-ink" />
        </div>
      </div>

      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>Bas {formatPercent(band.bas)}</span>
        <span>Moyen {formatPercent(band.moyen)}</span>
        <span>Bon {formatPercent(band.bon)}</span>
      </div>
    </div>
  );
}
