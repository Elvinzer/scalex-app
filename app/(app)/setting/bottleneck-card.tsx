import { STAGE_LABELS, STAGE_TIPS, type Bottleneck } from "@/lib/setting/funnel";

export function BottleneckCard({ bottleneck }: { bottleneck: Bottleneck | null }) {
  if (!bottleneck) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center">
        <p className="text-sm font-medium">Pas encore assez de données</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ajoute quelques jours de suite pour voir apparaître ton point de friction
          prioritaire.
        </p>
      </div>
    );
  }

  const percent = Math.round(bottleneck.rate * 100);

  return (
    <div className="signature-glow relative overflow-hidden rounded-4xl border border-border bg-card p-8">
      <p className="text-sm font-medium text-primary">Ton plus gros point de friction</p>
      <div className="mt-2 flex items-baseline gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {STAGE_LABELS[bottleneck.stage]}
        </h2>
        <span className="font-mono text-2xl font-semibold tabular-nums text-state-critical">
          {percent}%
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        {STAGE_TIPS[bottleneck.stage]}
      </p>
    </div>
  );
}
