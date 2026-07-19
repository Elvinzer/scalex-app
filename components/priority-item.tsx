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
        "sticker-card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between",
        isTop && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-medium",
            isTop ? "text-white shadow-[0_4px_14px_var(--accent-glow)]" : "bg-muted text-muted-foreground"
          )}
          style={isTop ? { background: "var(--gradient-accent)" } : undefined}
        >
          {rank}
        </span>
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {point.category}
          </p>
          <p className="mt-0.5 font-medium">{point.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{point.explanation}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
        <span
          className="rounded-full bg-signal/15 px-3 py-1 text-sm font-medium whitespace-nowrap text-signal"
          title={point.tooltip}
        >
          {point.monthlyGain === null ? "+" + point.extraClients + " clients/mois" : `+${formatEur(point.monthlyGain)}/mois`}
        </span>
        {isTop ? (
          <Button asChild size="sm">
            <a href="/agent">Corriger avec l&apos;agent →</a>
          </Button>
        ) : (
          <a href="/diagnostic" className="text-sm font-medium text-muted-foreground hover:underline">
            Voir le détail
          </a>
        )}
      </div>
    </div>
  );
}
