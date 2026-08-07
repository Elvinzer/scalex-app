import { cn } from "@/lib/utils";

export type MetricNature = "Observé" | "Calculé" | "Benchmark" | "Projection";

const natureClasses: Record<MetricNature, string> = {
  Observé: "border-border bg-card text-muted-foreground",
  Calculé: "border-border bg-muted text-muted-foreground",
  Benchmark: "border-accent-2-border bg-accent-2-soft text-accent-2-text",
  Projection: "border-border bg-transparent text-mist/70",
};

export function NatureBadge({ nature, className }: { nature: MetricNature; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-bold", natureClasses[nature], className)}>
      {nature}
    </span>
  );
}
