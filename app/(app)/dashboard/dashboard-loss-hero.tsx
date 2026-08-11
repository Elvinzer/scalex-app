import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FalcoPageGreet } from "@/components/falco/falco-page-greet";
import { NatureBadge } from "@/components/nature-badge";
import { Button } from "@/components/ui/button";
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { DiagnosticPoint } from "@/lib/diagnostic/cascade";
import { sumChiffrableMonthlyGains } from "@/lib/diagnostic/monthly-gap";
import { formatEur } from "@/lib/currency";
import type { BusinessProfileData } from "@/lib/business/types";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import type { MonthWindow } from "@/lib/diagnostic/completed-months";
import type { FunnelTotals } from "@/lib/setting/funnel";

export async function DashboardLossHero({
  accountId,
  businessProfile,
  settingTotals,
  closingTotals,
  cashContractedTotal,
  hasAnyData,
  months,
  points,
  locale,
  bottleneckLabel,
}: {
  accountId: string;
  businessProfile: BusinessProfileData;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  hasAnyData: boolean;
  months: MonthWindow[];
  points: DiagnosticPoint[];
  locale: string;
  bottleneckLabel: string;
}) {
  const t = await getTranslations("dashboard");
  const { toImplement, toWatch } = hasAnyData
    ? await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: months.length,
        months,
      })
    : { toImplement: [], toWatch: [] };
  const topActiveLevers = [...toWatch].sort((a, b) => b.score - a.score).slice(0, 3);
  const totalMonthlyLoss = !hasAnyData
    ? null
    : sumChiffrableMonthlyGains([
        ...points.map((point) => point.monthlyGain),
        ...topActiveLevers.map((lever) => lever.impactAmountEur),
        ...toImplement.map((lever) => lever.impactAmountEur),
      ]);
  const heroFalco = !hasAnyData
    ? { pose: "sleeping" as const, line: t("completeNumbers") }
    : points.length > 0
      ? { pose: "alert" as const, line: t("bottleneck", { label: bottleneckLabel }) }
      : { pose: "happy" as const, line: t("solidLevers") };

  return (
    <section className="sticker-spotlight animate-rise px-7 py-6" aria-labelledby="dashboard-gap-title">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p id="dashboard-gap-title" className="text-xs font-bold tracking-[0.08em] text-mist/60 uppercase">{t("lossDetected")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="figure-hero">{totalMonthlyLoss === null ? "—" : formatEur(totalMonthlyLoss, locale)}</p>
            <NatureBadge nature="Projection" />
          </div>
          <p className="mt-2 text-sm text-mist/60">{t("source")}</p>
        </div>
        <FalcoPageGreet pageKey="dashboard" pose={heroFalco.pose} size="sm" className="hidden lg:flex" />
        <div className="flex flex-wrap gap-2">
          <Button size="lg" asChild>
            <Link href="/diagnostic" prefetch={true}>{t("viewDiagnostic")}</Link>
          </Button>
          <Button size="lg" variant="outline" className="border-mist/20 bg-transparent text-text-on-dark hover:bg-mist/10 hover:text-text-on-dark" asChild>
            <Link href="/diagnostic#calcul" prefetch={true}>{t("howCalculated")}</Link>
          </Button>
        </div>
      </div>
      <p className="sr-only">{heroFalco.line}</p>
    </section>
  );
}

export function DashboardLossHeroSkeleton() {
  return (
    <section className="sticker-spotlight px-7 py-6" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="h-3 w-28 animate-pulse rounded bg-mist/20 motion-reduce:animate-none" />
          <div className="mt-3 h-12 w-40 animate-pulse rounded bg-mist/20 motion-reduce:animate-none" />
          <div className="mt-3 h-4 w-56 animate-pulse rounded bg-mist/20 motion-reduce:animate-none" />
        </div>
        <div className="h-10 w-48 animate-pulse rounded bg-mist/20 motion-reduce:animate-none" />
      </div>
    </section>
  );
}
