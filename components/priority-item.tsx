import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import type { DiagnosticPoint } from "@/lib/diagnostic/cascade";
import { cn } from "@/lib/utils";

export function PriorityItem({
  rank,
  point,
}: {
  rank: 1 | 2 | 3;
  point: DiagnosticPoint;
}) {
  const isTop = rank === 1;

  return (
    <div
      className={cn(
        "sticker-card flex flex-col gap-4 p-6",
        isTop && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
              isTop ? "text-white shadow-[0_4px_14px_var(--accent-glow)]" : "bg-muted text-muted-foreground"
            )}
            style={isTop ? { background: "var(--gradient-accent)" } : undefined}
          >
            {rank}
          </span>
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              {point.category}
            </p>
            <p className="mt-0.5 font-bold">{point.label}</p>
            <p className="mt-1 text-sm font-bold text-muted-foreground">{point.explanation}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <span
            className="rounded-full bg-positive-soft px-3 py-1 text-sm font-bold whitespace-nowrap text-positive tabular-nums"
            title={point.tooltip}
          >
            {point.monthlyGain === null ? "+" + point.extraClients + " clients/mois" : `+${formatEur(point.monthlyGain)}/mois`}
          </span>
          {isTop ? (
            // Secondary, not coral — the page's one coral CTA is the hero
            // banner's "Récupérer ce cash →", which already points here.
            <Button asChild size="sm" variant="secondary">
              <a href={`/diagnostic?open=${point.key}`}>Améliorer ça →</a>
            </Button>
          ) : (
            <a href="/diagnostic" className="text-sm font-bold text-muted-foreground hover:underline">
              Voir le détail
            </a>
          )}
        </div>
      </div>

      {isTop && (
        <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
          <Falco pose="alert" size="xs" animate="enter" />
          <FalcoBubble arrow="left" className="max-w-none flex-1">
            Je recommande de commencer par ça — c&apos;est ton point le plus rentable à corriger cette semaine.
          </FalcoBubble>
        </div>
      )}
    </div>
  );
}
