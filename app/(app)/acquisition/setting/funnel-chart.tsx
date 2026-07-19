import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPercent, type FunnelRates, type FunnelStage, type FunnelTotals } from "@/lib/setting/funnel";

const STAGES: { key: keyof FunnelTotals; label: string }[] = [
  { key: "newSubscribers", label: "Nouveaux abonnés" },
  { key: "firstMessagesSent", label: "Premiers messages envoyés" },
  { key: "conversationsStarted", label: "Conversations démarrées" },
  { key: "callsProposed", label: "Appels proposés" },
  { key: "callsBooked", label: "Appels réservés" },
];

// Order matches the transition each rate measures: newSubscribers →
// firstMessagesSent is outreachRate, and so on down the funnel.
const CONNECTOR_RATES: FunnelStage[] = [
  "outreachRate",
  "responseRate",
  "proposalRate",
  "bookingRate",
];

// Server-rendered — one hue (--signal) because these five bars are stages
// of a single flow, not independent categories to compare; length is the
// only encoding that matters here, per the dataviz magnitude rule.
export function FunnelChart({
  totals,
  rates,
  bottleneckStage,
}: {
  totals: FunnelTotals;
  rates: FunnelRates;
  bottleneckStage: FunnelStage | null;
}) {
  const maxValue = Math.max(totals.newSubscribers, totals.firstMessagesSent, 1);

  return (
    <div className="flex flex-col gap-3">
      {STAGES.map((stage, index) => {
        const value = totals[stage.key];
        const widthPercent = Math.max((value / maxValue) * 100, value > 0 ? 4 : 1.5);
        const connectorRate = index > 0 ? CONNECTOR_RATES[index - 1] : null;
        const connectorValue = connectorRate ? rates[connectorRate] : null;
        const isBottleneckConnector = connectorRate === bottleneckStage;

        return (
          <div key={stage.key} className="flex flex-col gap-1.5">
            {connectorRate && (
              <div className="flex items-center gap-2 py-0.5 pl-1">
                <ArrowDown
                  className={cn(
                    "size-3.5",
                    isBottleneckConnector ? "text-state-critical" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    isBottleneckConnector
                      ? "font-medium text-state-critical"
                      : "text-muted-foreground"
                  )}
                >
                  {connectorValue === null ? "—" : formatPercent(connectorValue)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="w-48 shrink-0 text-sm text-muted-foreground">{stage.label}</div>
              <div className="relative h-8 flex-1 rounded-lg border border-ink/10 bg-muted">
                <div
                  className="h-full rounded-lg bg-signal transition-[width] duration-500 ease-out"
                  style={{ width: `${widthPercent}%` }}
                />
              </div>
              <div className="w-14 shrink-0 text-right font-display text-sm font-medium tabular-nums">
                {value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
