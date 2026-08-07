import { cn } from "@/lib/utils";

export type MetricSource = "Stripe" | "Calendly" | "iClosed" | "Pipeline" | "Saisie" | "Calculé" | "Stripe + saisie";

const sourceClasses: Record<MetricSource, string> = {
  Stripe: "bg-accent-2-soft text-accent-2-text",
  Calendly: "bg-accent-2-soft text-accent-2-text",
  iClosed: "bg-accent-2-soft text-accent-2-text",
  Pipeline: "bg-muted text-muted-foreground",
  Saisie: "bg-warning-soft text-warning-text",
  Calculé: "bg-muted text-muted-foreground",
  "Stripe + saisie": "bg-muted text-muted-foreground",
};

export function SourceBadge({ source, className }: { source: MetricSource; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold", sourceClasses[source], className)}>
      {source}
    </span>
  );
}
