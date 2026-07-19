import { ArrowDown } from "lucide-react";

import type { ClosingRates, ClosingTotals } from "@/lib/closing/metrics";
import type { OverviewBottleneck } from "@/lib/funnel/overview";
import { formatPercent, type FunnelRates, type FunnelTotals } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { FunnelChart } from "./setting/funnel-chart";

// Setting's own bar-list (FunnelChart) is reused as-is for the top group —
// its stages and scale are self-contained. Closing only has two stages, so
// they're rendered inline here rather than introducing a second reusable
// chart component for a two-row group.
export function OverviewFunnelChart({
  settingTotals,
  settingRates,
  closingTotals,
  bottleneck,
}: {
  settingTotals: FunnelTotals;
  settingRates: FunnelRates;
  closingTotals: ClosingTotals;
  closingRates: ClosingRates;
  bottleneck: OverviewBottleneck | null;
}) {
  const closingMax = Math.max(closingTotals.callsAttended, 1);
  const isClosingRateBottleneck = bottleneck?.source === "closing" && bottleneck.stage === "closingRate";
  const closingRate =
    closingTotals.callsAttended > 0 ? closingTotals.salesClosed / closingTotals.callsAttended : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Setting · prospection
        </p>
        <FunnelChart
          totals={settingTotals}
          rates={settingRates}
          bottleneckStage={bottleneck?.source === "setting" ? bottleneck.stage : null}
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Closing · vente
        </p>
        <div className="flex flex-col gap-3">
          <FunnelBar label="Appels pris" value={closingTotals.callsAttended} maxValue={closingMax} />

          <div className="flex items-center gap-2 py-0.5 pl-1">
            <ArrowDown
              className={cn("size-3.5", isClosingRateBottleneck ? "text-state-critical" : "text-muted-foreground")}
            />
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                isClosingRateBottleneck ? "font-medium text-state-critical" : "text-muted-foreground"
              )}
            >
              {closingRate === null ? "—" : formatPercent(closingRate)}
            </span>
          </div>

          <FunnelBar label="Ventes conclues" value={closingTotals.salesClosed} maxValue={closingMax} />
        </div>
      </div>
    </div>
  );
}

function FunnelBar({ label, value, maxValue }: { label: string; value: number; maxValue: number }) {
  const widthPercent = Math.max((value / maxValue) * 100, value > 0 ? 4 : 1.5);

  return (
    <div className="flex items-center gap-3">
      <div className="w-48 shrink-0 text-sm text-muted-foreground">{label}</div>
      <div className="relative h-8 flex-1 rounded-lg border border-ink/10 bg-muted">
        <div
          className="h-full rounded-lg bg-signal transition-[width] duration-500 ease-out"
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <div className="w-14 shrink-0 text-right font-display text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
