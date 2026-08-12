import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Sparkline } from "@/components/sparkline";
import type { MetricCard as MetricCardData } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";

export function MetricCard({ data }: { data: MetricCardData }) {
  const t = useTranslations("dashboard");
  const tStates = useTranslations("common.states");
  const metricKey = data.key === "new-customers"
    ? "newCustomers"
    : data.key === "average-sale"
      ? "averageSale"
      : data.key === "closing-rate"
        ? "closingRate"
        : data.key === "show-up-rate"
          ? "showUpRate"
          : data.key;
  const metricLabel = t(`metrics.${metricKey}`);
  const translatedReason = data.status === "missing" ? translateMetricCopy(data.reason, t) : null;
  const translatedCta = data.status === "missing" ? translateMetricCopy(data.ctaLabel, t) : null;
  const translatedSource = data.status === "ok" && data.sourceHint ? translateMetricCopy(data.sourceHint, t) : undefined;
  const translatedDelta = data.status === "ok" && data.deltaLabel ? translateDelta(data.deltaLabel, t) : data.status === "ok" ? data.deltaLabel : null;
  if (data.status === "missing") {
    return (
      <Link href={data.href} prefetch={true} className="sticker-card-dashed flex flex-col p-4">
        <p className="text-xs font-bold text-muted-foreground">{metricLabel}</p>
        <p className="mt-2 text-sm font-bold text-muted-foreground/80">{tStates("empty")}</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground/70">{translatedReason}</p>
        <span className="mt-auto pt-3 text-sm font-bold text-accent">{translatedCta} →</span>
      </Link>
    );
  }

  return (
    <Link
      href={data.href}
      prefetch={true}
      className="sticker-card flex flex-col p-4 hover:border-border-hover"
      title={translatedSource}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-bold text-muted-foreground">{metricLabel}</p>
        {translatedSource && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              translatedSource === "Stripe" ? "bg-signal/15 text-signal" : "bg-muted text-muted-foreground"
            )}
          >
            {translatedSource}
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xl font-bold tracking-[-0.01em] tabular-nums">{data.valueLabel}</p>
      <div className="mt-1 min-h-4">
        {translatedDelta && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-bold",
              data.deltaDirection === "up" && "text-state-healthy",
              data.deltaDirection === "down" && "text-state-critical",
              data.deltaDirection === null && "text-muted-foreground"
            )}
          >
            {data.deltaDirection === "up" && <ArrowUp className="size-3" />}
            {data.deltaDirection === "down" && <ArrowDown className="size-3" />}
            {translatedDelta}
          </p>
        )}
      </div>
      <div className="mt-auto pt-3">
        <Sparkline values={data.sparklineValues} labels={data.sparklineLabels} />
      </div>
    </Link>
  );
}

function translateMetricCopy(value: string, t: ReturnType<typeof useTranslations>): string {
  const keyByFrench: Record<string, string> = {
    "Stripe non connecté et rien saisi dans Datas": "stripeMissing",
    "Rien saisi ce mois-ci": "nothingThisMonth",
    "Stripe non connecté": "stripeNotConnected",
    "Synchronisation en cours": "syncing",
    "Rien saisi pour l'instant": "nothingYet",
    "Analytics page de vente non connectées": "pageAnalyticsMissing",
    "Aucun revenu connu ce mois-ci": "noRevenueThisMonth",
    "Aucune vente ce mois-ci": "noSalesThisMonth",
    "Connecte Stripe": "connectStripe",
    "Remplir dans Datas": "fillDatas",
    "Voir Mon business": "viewBusiness",
    "Saisie manuelle": "manualEntry",
  };
  return keyByFrench[value] ? t(`metrics.${keyByFrench[value]}`) : value;
}

function translateDelta(value: string, t: ReturnType<typeof useTranslations>): string {
  return value.replace("mois précédent", t("metrics.previousMonth"));
}
