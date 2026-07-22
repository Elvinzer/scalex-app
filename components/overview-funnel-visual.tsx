import type { ClosingRates, ClosingTotals } from "@/lib/closing/metrics";
import type { MetricHealthCard } from "@/lib/diagnostic/cascade";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";
import type { OverviewBottleneck } from "@/lib/funnel/overview";
import { formatPercent, type FunnelRates, type FunnelTotals } from "@/lib/setting/funnel";

const NEUTRAL_COLOR = "var(--surface-sunken)";
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

type Stage = {
  key: string;
  label: string;
  volume: number;
  // What produces the incoming rate shown above this stage's bar — null for
  // the very first stage (nothing feeds into it).
  incomingRate: number | null;
  incomingRateLabel: string | null;
  metricKey: MetricKey | null; // for score-based coloring — null where no benchmark exists (outreachRate)
  isBottleneck: boolean;
};

function buildStages({
  settingTotals,
  closingTotals,
  settingRates,
  closingRates,
  bottleneck,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  settingRates: FunnelRates;
  closingRates: ClosingRates;
  bottleneck: OverviewBottleneck | null;
}): Stage[] {
  const isBottleneck = (source: "setting" | "closing", stage: string) =>
    bottleneck !== null && bottleneck.source === source && bottleneck.stage === stage;

  return [
    {
      key: "newSubscribers",
      label: "Abonnés",
      volume: settingTotals.newSubscribers,
      incomingRate: null,
      incomingRateLabel: null,
      metricKey: null,
      isBottleneck: false,
    },
    {
      key: "firstMessagesSent",
      label: "Messages envoyés",
      volume: settingTotals.firstMessagesSent,
      incomingRate: settingRates.outreachRate,
      incomingRateLabel: settingRates.outreachRate === null ? null : formatPercent(settingRates.outreachRate),
      metricKey: null,
      isBottleneck: isBottleneck("setting", "outreachRate"),
    },
    {
      key: "conversationsStarted",
      label: "Conversations",
      volume: settingTotals.conversationsStarted,
      incomingRate: settingRates.responseRate,
      incomingRateLabel: settingRates.responseRate === null ? null : formatPercent(settingRates.responseRate),
      metricKey: "responseRate",
      isBottleneck: isBottleneck("setting", "responseRate"),
    },
    {
      key: "callsProposed",
      label: "Appels proposés",
      volume: settingTotals.callsProposed,
      incomingRate: settingRates.proposalRate,
      incomingRateLabel: settingRates.proposalRate === null ? null : formatPercent(settingRates.proposalRate),
      metricKey: "proposalRate",
      isBottleneck: isBottleneck("setting", "proposalRate"),
    },
    {
      key: "callsBooked",
      label: "Appels réservés",
      volume: settingTotals.callsBooked,
      incomingRate: settingRates.bookingRate,
      incomingRateLabel: settingRates.bookingRate === null ? null : formatPercent(settingRates.bookingRate),
      metricKey: "bookingRate",
      isBottleneck: isBottleneck("setting", "bookingRate"),
    },
    {
      key: "callsAttended",
      label: "Appels pris",
      volume: closingTotals.callsAttended,
      incomingRate: closingRates.showUpRate,
      incomingRateLabel: closingRates.showUpRate === null ? null : formatPercent(closingRates.showUpRate),
      metricKey: "showUpRate",
      isBottleneck: isBottleneck("closing", "showUpRate"),
    },
    {
      key: "salesClosed",
      label: "Ventes",
      volume: closingTotals.salesClosed,
      incomingRate: closingRates.closingRate,
      incomingRateLabel: closingRates.closingRate === null ? null : formatPercent(closingRates.closingRate),
      metricKey: "closingRate",
      isBottleneck: isBottleneck("closing", "closingRate"),
    },
  ];
}

// Vertical funnel — centered trapezoids (top width = this stage's volume,
// bottom width = the next stage's volume), so the shape itself narrows
// exactly where the drop-off happens. Bars colored by getHealthTier on the
// stage's already-computed cascade score (lib/diagnostic/cascade.ts) —
// zero new scoring logic, just a new shape/layout for existing numbers.
export function OverviewFunnelVisual({
  settingTotals,
  closingTotals,
  settingRates,
  closingRates,
  metricScores,
  bottleneck,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  settingRates: FunnelRates;
  closingRates: ClosingRates;
  metricScores: MetricHealthCard[];
  bottleneck: OverviewBottleneck | null;
}) {
  const stages = buildStages({ settingTotals, closingTotals, settingRates, closingRates, bottleneck });
  const maxVolume = Math.max(settingTotals.newSubscribers, 1);
  const overallRate =
    settingTotals.newSubscribers > 0 ? closingTotals.salesClosed / settingTotals.newSubscribers : null;

  const BAR_HEIGHT = 40;
  const GAP = 22;

  function widthPercent(volume: number): number {
    return Math.max((volume / maxVolume) * 100, volume > 0 ? 6 : 2);
  }

  function colorFor(stage: Stage): string {
    if (stage.metricKey === null) return NEUTRAL_COLOR;
    const card = metricScores.find((c) => c.key === stage.metricKey);
    if (!card) return NEUTRAL_COLOR;
    return getHealthTier(card.score).colorBar;
  }

  return (
    <div>
      <h2 className="mb-4 text-base font-bold">Ton funnel</h2>

      <div className="flex flex-col items-center">
        {stages.map((stage, index) => {
          const topWidth = widthPercent(stage.volume);
          const nextVolume = stages[index + 1]?.volume ?? stage.volume;
          const bottomWidth = index < stages.length - 1 ? widthPercent(nextVolume) : topWidth;
          const topInset = (100 - topWidth) / 2;
          const bottomInset = (100 - bottomWidth) / 2;
          const color = colorFor(stage);

          return (
            <div key={stage.key} className="w-full max-w-md">
              {index > 0 && stage.incomingRateLabel && (
                <p className="py-1 text-center text-[11px] font-bold text-muted-foreground">
                  {stage.incomingRateLabel}
                </p>
              )}
              <div className="relative flex items-center justify-center" style={{ height: BAR_HEIGHT, marginBottom: index < stages.length - 1 ? GAP - BAR_HEIGHT / 2 : 0 }}>
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: `polygon(${topInset}% 0, ${100 - topInset}% 0, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`,
                    background: color,
                    outline: stage.isBottleneck ? "2px solid var(--state-critical)" : undefined,
                    outlineOffset: -2,
                  }}
                />
                <div className="relative flex w-full items-center justify-between px-4 text-xs font-bold">
                  <span className="text-foreground/80">{stage.label}</span>
                  <span className="flex items-center gap-2">
                    {stage.isBottleneck && (
                      <span className="rounded-full bg-state-critical px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        Goulot
                      </span>
                    )}
                    <span className="tabular-nums">{NUMBER_FORMAT.format(stage.volume)}</span>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-xs font-bold text-muted-foreground">
        Taux global abonné → vente :{" "}
        <span className="text-foreground">{overallRate === null ? "—" : formatPercent(overallRate)}</span>
      </p>
    </div>
  );
}
