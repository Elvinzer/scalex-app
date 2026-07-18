import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";

import { Sparkline } from "@/components/sparkline";
import type { MetricCard as MetricCardData } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";

export function MetricCard({ data }: { data: MetricCardData }) {
  if (data.status === "missing") {
    return (
      <Link href={data.href} className="sticker-card-dashed flex flex-col p-5">
        <p className="text-sm font-bold text-muted-foreground">{data.label}</p>
        <p className="mt-2 text-sm text-muted-foreground/80">Donnée manquante</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{data.reason}</p>
        <span className="mt-auto pt-3 text-sm font-bold text-signal">{data.ctaLabel} →</span>
      </Link>
    );
  }

  return (
    <Link href={data.href} className="sticker-card flex flex-col p-5">
      <p className="text-sm font-bold text-muted-foreground">{data.label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{data.valueLabel}</p>
      <div className="mt-1 min-h-4">
        {data.deltaLabel && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              data.deltaDirection === "up" && "text-state-healthy",
              data.deltaDirection === "down" && "text-state-critical",
              data.deltaDirection === null && "text-muted-foreground"
            )}
          >
            {data.deltaDirection === "up" && <ArrowUp className="size-3" />}
            {data.deltaDirection === "down" && <ArrowDown className="size-3" />}
            {data.deltaLabel}
          </p>
        )}
      </div>
      <div className="mt-auto pt-3">
        <Sparkline values={data.sparklineValues} labels={data.sparklineLabels} />
      </div>
    </Link>
  );
}
