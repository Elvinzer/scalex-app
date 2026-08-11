import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { FailedPaymentsPanel, type FailedPaymentItem } from "@/components/failed-payments-panel";
import { IntegrationStatusRow } from "@/components/integration-status-row";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { StripeInsightsSection } from "./stripe-insights-section";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { getSetters } from "@/lib/setters/queries";
import { getLatestStripeInsightRun, getStripeInsightData } from "@/lib/stripe/insight-queries";
import { buildStripeInsightSignals, buildStripeInsightSnapshot, buildStripeTrend } from "@/lib/stripe/transaction-insights";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import type { ResolvedPeriod } from "@/lib/period";

import { SaleFormDialog } from "./sale-form-dialog";
import { SalesTable } from "./sales-table";

// Stripe syncs write fresh rows from an asynchronous Inngest job. This page
// must always read the current projection when router.refresh() requests a
// new server render instead of reusing a cached route result.
export const dynamic = "force-dynamic";

type StripeConnectionPreview = {
  initialSyncStatus: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
};

async function StripeInsightsLoader({
  accountId,
  connection,
  period,
  periodKey,
  requestedCurrency,
  pending,
  locale,
}: {
  accountId: string;
  connection: { stripeAccountId: string; preview: StripeConnectionPreview } | null;
  period: ResolvedPeriod;
  periodKey: string;
  requestedCurrency: string | null | undefined;
  pending: number;
  locale: string;
}) {
  if (!connection) {
    return (
      <StripeInsightsSection
        connected={false}
        connection={null}
        periodKey={periodKey}
        availableCurrencies={[]}
        activeCurrency={null}
        snapshot={null}
        signals={[]}
        trend={[]}
        visibleTransactions={[]}
        initialInsightText={null}
      />
    );
  }

  let stripeInsight = await getStripeInsightData(accountId, connection.stripeAccountId, period, requestedCurrency);
  if (stripeInsight.snapshot && stripeInsight.activeCurrency === "eur" && pending > 0) {
    const snapshot = buildStripeInsightSnapshot(
      stripeInsight.transactions,
      stripeInsight.refunds,
      period,
      stripeInsight.activeCurrency,
      pending * 100,
    );
    stripeInsight = {
      ...stripeInsight,
      snapshot,
      signals: buildStripeInsightSignals(snapshot),
      trend: buildStripeTrend(stripeInsight.transactions, stripeInsight.refunds, period, stripeInsight.activeCurrency),
    };
  }
  if (stripeInsight.snapshot && stripeInsight.activeCurrency) {
    stripeInsight = {
      ...stripeInsight,
      signals: buildStripeInsightSignals(stripeInsight.snapshot, locale),
      trend: buildStripeTrend(stripeInsight.transactions, stripeInsight.refunds, period, stripeInsight.activeCurrency, locale),
    };
  }
  const latestStripeInsight = stripeInsight.activeCurrency
    ? await getLatestStripeInsightRun(accountId, stripeInsight.activeCurrency, period)
    : null;

  return (
    <StripeInsightsSection
      connected
      connection={connection.preview}
      periodKey={periodKey}
      availableCurrencies={stripeInsight.availableCurrencies}
      activeCurrency={stripeInsight.activeCurrency}
      snapshot={stripeInsight.snapshot}
      signals={stripeInsight.signals}
      trend={stripeInsight.trend}
      visibleTransactions={stripeInsight.visibleTransactions}
      initialInsightText={latestStripeInsight?.insightText ?? null}
    />
  );
}

function StripeInsightsSkeleton() {
  return (
    <section className="sticker-card p-5 sm:p-6" aria-hidden="true">
      <div className="h-3 w-28 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-3 h-6 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="mt-5 h-28 animate-pulse rounded-[var(--radius-control)] bg-muted motion-reduce:animate-none" />
    </section>
  );
}

export default async function SuiviDesVentesPage({ searchParams }: { searchParams: Promise<{ period?: string; currency?: string }> }) {
  const t = await getTranslations("sales");
  const locale = await getLocale();
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:suivi");
  const stripeConnected = Boolean(user?.stripeConnectId);
  const query = await searchParams;
  const period = resolvePeriod(query.period);
  const [sales, profile, setters, [connection], youtubeInsights] = await Promise.all([
    getSales(accountId),
    getBusinessProfile(accountId),
    getSetters(accountId),
    stripeConnected
      ? db.select().from(stripeConnections).where(eq(stripeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    user?.youtubeConnected ? getYoutubeVideoInsightsMap(accountId) : Promise.resolve(new Map()),
  ]);
  const offers = profile.sales.offers;

  // Choices for the sale form's "which video brought this client" field.
  // Public only (a private upload can't have converted a stranger) and
  // newest first, since a freshly-closed sale most often traces back to a
  // recent video.
  const youtubeVideoChoices = Array.from(youtubeInsights.values())
    .filter(isPublicVideo)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .map((video) => ({ videoId: video.videoId, title: video.title }));

  // Account-wide, not period-scoped, so an issue does not disappear when the
  // period tabs narrow to a month that does not contain it.
  const failedPaymentItems: FailedPaymentItem[] = sales.flatMap((sale) =>
    (sale.installments ?? [])
      .map((installment, index) => ({ installment, index }))
      .filter(({ installment }) => installment.status === "failed" && Boolean(installment.stripeChargeId))
      .map(({ installment, index }) => ({
        id: `${sale.id}-${index}`,
        client: sale.isOrphan ? t("paymentToAttach") : sale.clientName,
        amount: installment.amount,
        reason: installment.failureReason ?? t("stripePaymentDeclined"),
        dueDate: installment.dueDate,
        attempts: 1,
      }))
  );

  const periodSales = sales.filter((sale) => isInPeriod(period, dateFromDayString(sale.saleDate)));
  const validPeriodSales = periodSales.filter((sale) => !sale.isOrphan);

  const cashContracted = validPeriodSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const summaries = validPeriodSales.map((sale) => summarize(sale.totalPrice, sale.installments));
  const cashCollected = summaries.reduce((sum, summary) => sum + summary.paidTotal, 0);
  const pending = summaries.reduce((sum, summary) => sum + summary.pendingTotal, 0);
  const failed = summaries.reduce((sum, summary) => sum + summary.failedTotal, 0);

  const stateText =
    periodSales.length > 0
      ? t("stateWithSales", { count: periodSales.length, amount: new Intl.NumberFormat(locale).format(cashCollected) })
      : t("stateNoSales");
  // No MetricKey for Suivi des ventes in the Copilote pipeline — general topic.
  const chatContext: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "ventes_suivi" };

  return (
    <div className="flex flex-col gap-8">
      {stripeConnected && <FailedPaymentsPanel items={failedPaymentItems} />}

      <AgentBanner stateText={stateText} ctaLabel={t("improve")} chatContext={chatContext} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
          <div className="mt-3">
            <IntegrationStatusRow
              name={t("stripe")}
              status={stripeConnected ? "connected" : "not_connected"}
              detail={stripeConnected ? t("stripeConnected") : t("stripeDisconnected")}
              showStatusLabel={false}
              action={
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <Link href="/integrations#stripe">{stripeConnected ? t("manage") : t("connect")}</Link>
                </Button>
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter current={period.key} />
          <SaleFormDialog
            offers={offers}
            setters={setters}
            youtubeVideos={youtubeVideoChoices}
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                {t("addSale")}
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={t("contractedRevenue")} value={`${new Intl.NumberFormat(locale).format(cashContracted)} €`} detail={t("salesCount", { count: validPeriodSales.length })} />
        <KpiTile label={t("collectedRevenue")} value={`${new Intl.NumberFormat(locale).format(cashCollected)} €`} detail={t("salesCount", { count: validPeriodSales.length })} tone="positive" />
        <KpiTile label={t("upcomingPayments")} value={`${new Intl.NumberFormat(locale).format(pending)} €`} detail={t("toCollect")} tone="accent2" />
        <KpiTile label={t("failedPayments")} value={`${new Intl.NumberFormat(locale).format(failed)} €`} detail={t("toProcess")} tone={failed > 0 ? "negative" : "default"} />
      </div>

      <Suspense fallback={<StripeInsightsSkeleton />}>
        <StripeInsightsLoader
          accountId={accountId}
          connection={connection ? {
            stripeAccountId: connection.stripeAccountId,
            preview: {
              initialSyncStatus: connection.initialSyncStatus,
              lastSyncStartedAt: connection.lastSyncStartedAt?.toISOString() ?? null,
              lastSyncCompletedAt: connection.lastSyncCompletedAt?.toISOString() ?? null,
              lastSyncError: connection.lastSyncError,
            },
          } : null}
          period={period}
          periodKey={period.key}
          requestedCurrency={query.currency}
          pending={pending}
          locale={locale}
        />
      </Suspense>

      <SalesTable
        sales={periodSales}
        allSales={sales}
        setters={setters}
        offers={offers}
        stripeConnection={connection ? { accountId: connection.stripeAccountId, livemode: connection.livemode } : null}
      />
    </div>
  );
}
