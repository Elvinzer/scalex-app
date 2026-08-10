import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { AgentBanner } from "@/components/agent-banner";
import { LeverImpactEstimate } from "@/components/lever-impact-estimate";
import { MetaAdsConnectionCard, type MetaAdAccountOption } from "@/components/meta-ads/meta-ads-connection-card";
import { MetaAdsDashboard } from "@/components/meta-ads/meta-ads-dashboard";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { metaAdAccounts, metaAdsConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getLeverImpactEstimate } from "@/lib/levers/impact";
import { getLeverStatus } from "@/lib/levers/status";
import { getMetaAdsDashboard, metricValue } from "@/lib/meta-ads/queries";
import { metaAdsErrorMessage } from "@/lib/meta-ads/messages";
import { META_PERIOD_RANGE_OPTIONS, normalizeMetaPeriodSelection } from "@/lib/meta-ads/protocol";
import { requireOwner, requirePermissionOrRedirect } from "@/lib/team/context";

import { AdCopyTrigger } from "./ad-copy-trigger";

const LEVER_KEY = "ads";
// No settings UI for this — a hardcoded threshold below which running ads
// isn't the priority lever yet, same "explicit constant, no new config"
// approach as every other benchmark in lib/levers/opportunities.ts.
const ADS_MIN_MONTHLY_REVENUE_EUR = 3000;

const adsSearchParamsSchema = z.object({
  meta_days: z.string().optional(),
  meta_range: z.enum(META_PERIOD_RANGE_OPTIONS).optional(),
  meta_from: z.string().optional(),
  meta_to: z.string().optional(),
  meta_ads: z.string().optional(),
  meta_ads_error: z.string().optional(),
});

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ meta_days?: string; meta_range?: string; meta_from?: string; meta_to?: string; meta_ads?: string; meta_ads_error?: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("app.ads");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const parsedSearchParams = adsSearchParamsSchema.safeParse(await searchParams);
  const search = parsedSearchParams.success ? parsedSearchParams.data : {};
  const periodSelection = normalizeMetaPeriodSelection(search);
  const metaAdsErrorMessageText = metaAdsErrorMessage(search.meta_ads_error);
  const metaAdsErrorAlert = metaAdsErrorMessageText ? (
    <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-4 py-3 text-sm font-bold text-state-critical" role="alert">
      {metaAdsErrorMessageText}
    </div>
  ) : null;
  const ownerAccess = await requireOwner(userId);
  const [profile, lever, metaDashboard, metaConnectionRows, metaAdAccountRows, subscriptionActive] = await Promise.all([
    getBusinessProfile(accountId),
    getLeverStatus(accountId, LEVER_KEY),
    getMetaAdsDashboard(accountId, periodSelection),
    ownerAccess
      ? db.select().from(metaAdsConnections).where(eq(metaAdsConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    ownerAccess
      ? db
          .select({
            externalId: metaAdAccounts.externalId,
            name: metaAdAccounts.name,
            currency: metaAdAccounts.currency,
            timezone: metaAdAccounts.timezone,
            canRead: metaAdAccounts.canRead,
            disableReason: metaAdAccounts.disableReason,
          })
          .from(metaAdAccounts)
          .innerJoin(metaAdsConnections, eq(metaAdsConnections.id, metaAdAccounts.connectionId))
          .where(and(eq(metaAdAccounts.userId, accountId), eq(metaAdsConnections.userId, accountId)))
      : Promise.resolve([]),
    ownerAccess ? hasActiveSubscription(accountId) : Promise.resolve(false),
  ]);
  const [metaConnection] = metaConnectionRows;
  const metaAccounts: MetaAdAccountOption[] = metaAdAccountRows;
  const metaAdsConnected = Boolean(metaConnection && metaConnection.status !== "disconnected");
  const metaConnectionCard = ownerAccess ? (
    <MetaAdsConnectionCard
      connected={metaAdsConnected}
      connectionStatus={metaConnection?.status ?? null}
      metaUserName={metaConnection?.metaUserName ?? null}
      selectedAdAccountId={metaConnection?.selectedAdAccountId ?? null}
      initialSyncStatus={metaConnection?.initialSyncStatus ?? null}
      initialSyncCompletedAt={metaConnection?.initialSyncCompletedAt ?? null}
      lastSyncCompletedAt={metaConnection?.lastSyncCompletedAt ?? null}
      grantedScopes={metaConnection?.grantedScopes ?? []}
      accounts={metaAccounts}
      subscriptionActive={subscriptionActive}
      connectionNotice={search.meta_ads ?? null}
      returnTo="/acquisition/ads"
    />
  ) : null;

  const mode: "optimiser" | "demarrer" =
    metaDashboard !== null || lever.status === "active" ? "optimiser" : "demarrer";

  after(() => track("lever_page_viewed", userId, { lever: LEVER_KEY, mode }));

  const chatContext: ChatContext = { topicType: "lever", topicKey: LEVER_KEY, topicLabel: "Ads", sourcePage: "acquisition_ads" };
  const falcoSkin = resolveFalcoSkin("/acquisition/ads");

  if (mode === "demarrer") {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = await getDiagnosticKpiRawData(accountId);
    const months = lastCompletedMonths(3);
    const { cashContractedTotal } = aggregatePeriodTotals({ months, allMonthlyRows, allSettingEntries, allClosingEntries });
    const avgMonthlyRevenue = cashContractedTotal / months.length;

    if (avgMonthlyRevenue < ADS_MIN_MONTHLY_REVENUE_EUR && !metaDashboard) {
      return (
        <div className="flex flex-col gap-8">
          <AgentBanner
            stateText={t("notPriority")}
            ctaLabel={t("improve")}
            chatContext={chatContext}
            mode={mode}
            falcoSkin={falcoSkin}
          />
          <div>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
          </div>
          {metaAdsErrorAlert}
          {metaConnectionCard}
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">{t("notPriorityTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("notPriorityHelp", { revenue: formatEur(Math.round(avgMonthlyRevenue), locale) })}
            </p>
          </div>
        </div>
      );
    }

    const impact = await getLeverImpactEstimate(accountId, LEVER_KEY);

    return (
      <div className="flex flex-col gap-8">
        <AgentBanner
          stateText={t("noCampaignsState")}
          ctaLabel={t("improve")}
          chatContext={chatContext}
          falcoPose="thinking"
          mode={mode}
          falcoSkin={falcoSkin}
        />
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        {metaAdsErrorAlert}
        {metaConnectionCard}
        {impact && (
          <LeverImpactEstimate
            amountEur={impact.amountEur}
            rangeEur={impact.impactRangeEur}
            explanation={impact.explanation}
            warning={impact.warning}
            contextSentence={impact.contextSentence}
          />
        )}
        <Button variant="outline" asChild className="self-start">
          <Link href={`/demarrer/${LEVER_KEY}`} prefetch={true}>{t("fullGuide")} →</Link>
        </Button>
      </div>
    );
  }

  const stateText =
    metaDashboard
      ? t("connectedState", {
          spend: metricValue(metaDashboard.totals, "spendCents") === null ? t("unavailableSpend") : `${formatEur((metricValue(metaDashboard.totals, "spendCents") ?? 0) / 100, locale)} ${t("spent")}`,
          leads: metricValue(metaDashboard.totals, "leads") === null ? t("unavailableLeads") : `${metricValue(metaDashboard.totals, "leads")} ${t("measuredLeads")}`,
          days: metaDashboard.period.days,
        })
      : t("noSyncedCampaigns");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel={t("improve")}
        chatContext={chatContext}
        mode={mode}
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Ads</h1>
          <p className="mt-1 text-muted-foreground">
            {t("chatSubtitle")}
          </p>
        </div>
        <AdCopyTrigger offers={profile.sales.offers} />
      </div>

      {metaAdsErrorAlert}
      {metaConnectionCard}
      {metaDashboard && <MetaAdsDashboard data={metaDashboard} periodSelection={periodSelection} canManageCampaigns={Boolean(ownerAccess)} />}

      {profile.sales.offers.length === 0 && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("noOffers")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("noOffersHelp")}
          </p>
        </div>
      )}

    </div>
  );
}
