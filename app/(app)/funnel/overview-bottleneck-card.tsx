import { overviewBottleneckLabel, overviewBottleneckTip, type OverviewBottleneck } from "@/lib/funnel/overview";

export function OverviewBottleneckCard({ bottleneck }: { bottleneck: OverviewBottleneck | null }) {
  if (!bottleneck) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Pas encore assez de données</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoute quelques jours de suite, en Setting ou en Closing, pour voir apparaître ton
          point de friction prioritaire.
        </p>
      </div>
    );
  }

  const percent = Math.round(bottleneck.rate * 100);

  return (
    <div className="sticker-spotlight p-8">
      <p className="text-sm font-bold text-signal">Ton plus gros point de friction</p>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="text-2xl font-bold">{overviewBottleneckLabel(bottleneck)}</h2>
        <span className="font-display text-2xl font-bold tabular-nums text-state-critical">
          {percent}%
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-mist/70">{overviewBottleneckTip(bottleneck)}</p>
    </div>
  );
}
