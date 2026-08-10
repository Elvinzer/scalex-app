import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type MetricNature = "Observé" | "Calculé" | "Benchmark" | "Projection";

const natureClasses: Record<MetricNature, string> = {
  Observé: "border-border bg-card text-muted-foreground",
  Calculé: "border-border bg-muted text-muted-foreground",
  Benchmark: "border-accent-2-border bg-accent-2-soft text-accent-2-text",
  Projection: "border-border bg-transparent text-mist/70",
};

export function NatureBadge({ nature, className }: { nature: MetricNature; className?: string }) {
  const t = useTranslations("common.nature");
  const labels: Record<MetricNature, string> = {
    Observé: t("observed"),
    Calculé: t("calculated"),
    Benchmark: t("benchmark"),
    Projection: t("projection"),
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-bold", natureClasses[nature], className)}>
      {labels[nature]}
    </span>
  );
}
