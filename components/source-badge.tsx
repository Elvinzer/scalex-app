import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type MetricSource = "Stripe" | "Calendly" | "iClosed" | "Suivi d'appel" | "Pipeline" | "Saisie" | "Calculé" | "Stripe + saisie";

const sourceClasses: Record<MetricSource, string> = {
  Stripe: "bg-accent-2-soft text-accent-2-text",
  Calendly: "bg-accent-2-soft text-accent-2-text",
  iClosed: "bg-accent-2-soft text-accent-2-text",
  "Suivi d'appel": "bg-accent-2-soft text-accent-2-text",
  Pipeline: "bg-muted text-muted-foreground",
  Saisie: "bg-warning-soft text-warning-text",
  Calculé: "bg-muted text-muted-foreground",
  "Stripe + saisie": "bg-muted text-muted-foreground",
};

export function SourceBadge({ source, className }: { source: MetricSource; className?: string }) {
  const t = useTranslations("common.sources");
  const keyBySource: Record<MetricSource, string> = {
    Stripe: "stripe",
    Calendly: "calendly",
    iClosed: "iclosed",
    Pipeline: "pipeline",
    Saisie: "manual",
    Calculé: "calculated",
    "Stripe + saisie": "stripeManual",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-[11px] font-bold", sourceClasses[source], className)}>
      {t(keyBySource[source])}
    </span>
  );
}
