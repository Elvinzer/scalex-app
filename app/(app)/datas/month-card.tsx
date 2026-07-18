import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { EMPTY_MONTHLY_METRICS, MONTH_LABELS } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { formatEur } from "@/lib/currency";
import { rate, formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<string, string> = {
  complete: "bg-state-healthy-bg text-state-healthy",
  partial: "bg-state-caution-bg text-state-caution",
};

export function MonthCard({
  monthIndex,
  row,
  isCurrent,
  isFuture,
  onOpen,
}: {
  monthIndex: number;
  row: MonthlyMetricsRow | null;
  isCurrent: boolean;
  isFuture: boolean;
  onOpen: () => void;
}) {
  const data = row ?? EMPTY_MONTHLY_METRICS;
  const completion = computeCompletion(data);
  const status = monthStatus(completion);

  if (isFuture) {
    return (
      <div className="sticker-card-dashed flex flex-col p-5 opacity-40">
        <p className="font-bold">{MONTH_LABELS[monthIndex - 1]}</p>
        <p className="mt-2 text-sm text-muted-foreground">À venir</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "sticker-card flex flex-col p-5 text-left transition-transform hover:-translate-y-0.5",
        isCurrent && "border-signal"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold">{MONTH_LABELS[monthIndex - 1]}</p>
        {status === "complete" && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE.complete)}>
            Complet
          </span>
        )}
        {status === "partial" && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE.partial)}>
            {completion.count}/{completion.total} renseignés
          </span>
        )}
      </div>

      {status === "empty" && (
        <>
          <p className="mt-3 text-sm text-muted-foreground">Aucune donnée</p>
          <span className="mt-auto pt-3 text-sm font-bold text-signal">+ Remplir</span>
        </>
      )}

      {status !== "empty" && (
        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
          <p>{data.cashCollected !== null ? formatEur(data.cashCollected) : "—"} collectés</p>
          <p>{data.salesClosed !== null ? data.salesClosed : "—"} ventes conclues</p>
          <p>
            {(() => {
              const closingRate = rate(data.salesClosed ?? 0, data.callsTaken ?? 0);
              return closingRate === null ? "—" : formatPercent(closingRate);
            })()}{" "}
            de closing
          </p>
        </div>
      )}
    </button>
  );
}
