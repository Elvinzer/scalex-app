import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import type { DashboardBottleneck } from "@/lib/dashboard/bottlenecks";
import { cn } from "@/lib/utils";

export function PriorityItem({
  rank,
  bottleneck,
}: {
  rank: 1 | 2 | 3;
  bottleneck: DashboardBottleneck;
}) {
  const isTop = rank === 1;

  return (
    <div
      className={cn(
        "sticker-card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between",
        isTop && "border-signal bg-signal/5"
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
            isTop ? "bg-signal text-white" : "bg-muted text-muted-foreground"
          )}
        >
          {rank}
        </span>
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {bottleneck.category}
          </p>
          <p className="mt-0.5 font-bold">{bottleneck.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{bottleneck.explanation}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
        <span
          className="rounded-full bg-signal/15 px-3 py-1 text-sm font-bold whitespace-nowrap text-signal"
          title={bottleneck.tooltip}
        >
          ≈ {formatEur(bottleneck.estimatedMonthlyLoss)}/mois perdus
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
