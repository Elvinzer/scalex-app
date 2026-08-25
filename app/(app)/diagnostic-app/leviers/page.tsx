import Link from "next/link";
import { after } from "next/server";

import { DiscoveryOpportunityCard } from "../../diagnostic/discovery-opportunity-card";
import { OptimisationEntryCard } from "../../diagnostic/optimisation-entry-card";
import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { buildRevenueProjection, REVENUE_PROJECTION_MONTHS } from "@/lib/diagnostic/revenue-projection";
import { getDiscoveryProgress } from "@/app/(app)/diagnostic/discovery-actions";
import { getPriorityRules } from "@/lib/diagnostic/priority-rules";
import { scoreCandidates } from "@/lib/diagnostic/priority";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { track } from "@/lib/analytics";
import { getLocale, getTranslations } from "next-intl/server";

const LEVER_LABEL_KEYS: Record<string, string> = {
  lead_magnet: "leadMagnet",
  email_marketing: "emailMarketing",
  newsletter: "newsletter",
  seo_blog: "seoBlog",
  podcast: "podcast",
  retargeting: "retargeting",
  referral: "referral",
  ads: "ads",
  vsl: "vsl",
  webinar: "webinar",
  sequence_relance_non_acheteurs: "nonBuyerFollowup",
  order_bump: "orderBump",
  downsell: "downsell",
  garantie: "guarantee",
  preuve_sociale_page: "socialProof",
  upsell_ascension: "upsell",
  onboarding_structure: "onboarding",
  collecte_temoignages_systematique: "testimonials",
  communaute_clients: "community",
  reactivation_anciens_clients: "reactivation",
};

function localizedCategoryKey(category: string): string {
  return category.toLowerCase() === "contenu" ? "content" : category.toLowerCase();
}

export default async function DiagnosticLeversPage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const locale = await getLocale();
  const t = await getTranslations("diagnostic");
  const [businessProfile, rawData, acquisitionCatalog, benchmarks, discoveryProgress, priorityRules] = await Promise.all([
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getAcquisitionFunnelCatalog(),
    getDiagnosticBenchmarks(user?.sector ?? null),
    getDiscoveryProgress(accountId),
    getPriorityRules(),
  ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const activeMetricKeys = activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog);
  const months = lastCompletedMonths(REVENUE_PROJECTION_MONTHS);
  const { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allSales, allLeads, allLeadStageHistory, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads } = rawData;
  const { settingTotals, closingTotals, cashContractedTotal, hasAnySourceData } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
    callSourcesByMonth: allCallSourcesByMonth,
    callTrackingConnected: Boolean(user?.iclosedConnected || user?.calendlyConnected),
    allSales,
    allLeads,
    allLeadStageHistory,
    allEmailCampaigns,
    allMetaMetrics,
    allNativeBookingLeads,
  });
  const points = hasAnySourceData
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal, activeMetricKeys, periodMonths: months.length })
    : [];
  const { toImplement } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: months.length,
    months,
  });
  const monthlyRevenueEur = cashContractedTotal / months.length;
  const addList = scoreCandidates({
    points: [],
    leverCandidates: toImplement.map((opportunity) => ({
      leverKey: opportunity.leverKey,
      label: opportunity.label,
      category: opportunity.category,
      impactAmountEur: opportunity.impactAmountEur,
      effort: opportunity.effort,
      healthScore: 0,
      isActive: false,
    })),
    businessProfile,
    monthlyRevenueEur,
    rules: priorityRules,
  });
  const opportunityByKey = new Map(toImplement.map((opportunity) => [opportunity.leverKey, opportunity]));
  const projection = buildRevenueProjection({
    cashContractedTotal,
    monthsCount: REVENUE_PROJECTION_MONTHS,
    bottleneckGain: points[0]?.monthlyGain ?? null,
    leverGains: toImplement.map((opportunity) => opportunity.impactAmountEur ?? 0),
  });
  const topLeverOpportunities = [...toImplement]
    .filter((opportunity) => opportunity.impactAmountEur !== null && opportunity.impactAmountEur > 0)
    .sort((a, b) => (b.impactAmountEur ?? 0) - (a.impactAmountEur ?? 0))
    .slice(0, 3);
  const discoveryRemaining = discoveryProgress.total - discoveryProgress.answered;
  after(() => track("diagnostic_add_viewed", userId, { opportunities_count: addList.length }));

  const localizedLeverLabel = (leverKey: string, fallback: string) => {
    const key = LEVER_LABEL_KEYS[leverKey];
    return key ? t(`levers.${key}`) : fallback;
  };
  const localizedCategory = (category: string) => t(`categories.${localizedCategoryKey(category)}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("addTitle")}</p>
          <h1 className="mt-1 text-[22px] leading-[1.2] font-bold">{t("addPageTitle")}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("addPageIntro")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/diagnostic-app" prefetch={true}>{t("backToDiagnostic")}</Link>
        </Button>
      </div>

      <section className="sticker-spotlight flex flex-col gap-5 px-7 py-6" aria-labelledby="potential-revenue-title">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-mist/70 uppercase">{t("projectionEyebrow")}</p>
          <h2 id="potential-revenue-title" className="mt-2 text-xl font-bold">{t("projectionTitle")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-mist/70">{t("projectionHelp")}</p>
        </div>
        {projection.potentialMonthlyRevenue === null ? (
          <div className="rounded-[var(--radius-card)] border border-mist/20 bg-mist/10 p-4 text-sm text-mist/80">
            <p className="font-bold">{t("projectionUnavailable")}</p>
            <p className="mt-1">{t("projectionUnavailableHelp")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[var(--radius-card)] border border-mist/15 bg-mist/10 p-4">
              <p className="text-xs text-mist/65">{t("baseRevenue")}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{projection.averageMonthlyRevenue === null ? "—" : formatEur(projection.averageMonthlyRevenue, locale)}</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-mist/15 bg-mist/10 p-4">
              <p className="text-xs text-mist/65">{t("scaleScoreProjection")}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatEur(projection.optimizedMonthlyRevenue ?? 0, locale)}</p>
            </div>
            <div className="rounded-[var(--radius-card)] border border-accent/40 bg-accent-soft/20 p-4">
              <p className="text-xs text-mist/65">{t("potentialRevenue")}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatEur(projection.potentialMonthlyRevenue, locale)}</p>
            </div>
          </div>
        )}
        {topLeverOpportunities.length > 0 && (
          <div className="rounded-[var(--radius-card)] border border-mist/15 bg-mist/10 p-4">
            <p className="text-xs font-bold tracking-wide text-mist/65 uppercase">{t("topLeversTitle")}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-3">
              {topLeverOpportunities.map((opportunity) => (
                <li key={opportunity.leverKey} className="flex items-center justify-between gap-2 text-sm">
                  <span>{localizedLeverLabel(opportunity.leverKey, opportunity.label)}</span>
                  <span className="font-bold tabular-nums">+{formatEur(opportunity.impactAmountEur ?? 0, locale)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="levers-list-title">
        <div>
          <h2 id="levers-list-title" className="text-lg font-bold">{t("addTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("addHelp")}</p>
        </div>
        {addList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addList.map(({ candidate }) => {
              const opportunity = opportunityByKey.get(candidate.key);
              if (!opportunity) return null;
              return (
                <DiscoveryOpportunityCard
                  key={opportunity.leverKey}
                  leverKey={opportunity.leverKey}
                  label={localizedLeverLabel(opportunity.leverKey, opportunity.label)}
                  category={localizedCategory(opportunity.category)}
                  effort={opportunity.effort}
                  impactAmountEur={opportunity.impactAmountEur}
                  impactRangeEur={opportunity.impactRangeEur}
                  impactExplanation={opportunity.impactExplanation}
                  contextSentence={opportunity.contextSentence}
                  warning={opportunity.warning}
                  ctaLabel={t("discover")}
                  sourcePage="diagnostic_add"
                  insightSourceId={opportunity.leverKey}
                />
              );
            })}
          </div>
        ) : (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">{t("noneAdditional")}</div>
        )}

        {discoveryRemaining > 0 && (
          <OptimisationEntryCard
            answered={discoveryProgress.answered}
            total={discoveryProgress.total}
            remaining={discoveryRemaining}
          />
        )}
      </section>
    </div>
  );
}
