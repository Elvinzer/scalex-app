import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { FailedPaymentsPanel, type FailedPaymentItem } from "@/components/failed-payments-panel";
import { ConnectedIntegrationRow } from "@/components/integrations/connected-integration-row";
import { IntegrationStatusRow } from "@/components/integration-status-row";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodFilter } from "@/components/period-filter";
import { UpcomingPaymentsForecast } from "@/components/upcoming-payments-forecast";
import { Button } from "@/components/ui/button";
import { StripeInsightsSection } from "./stripe-insights-section";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { getActiveClosers } from "@/lib/closers/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { buildUpcomingPaymentForecast } from "@/lib/sales/forecast";
import { getSetters } from "@/lib/setters/queries";
import { getStripeInsightData } from "@/lib/stripe/insight-queries";
import { buildStripeFailureSignal, buildStripeInsightSignals, buildStripeInsightSnapshot, buildStripeTrend } from "@/lib/stripe/transaction-insights";
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

async function loadStripeInsightData({
  accountId,
  connection,
  period,
  requestedCurrency,
  pending,
  locale,
}: {
  accountId: string;
  connection: { stripeAccountId: string } | null;
  period: ResolvedPeriod;
  requestedCurrency: string | null | undefined;
  pending: number;
  locale: string;
}) {
  if (!connection) return null;

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
      signals: buildStripeInsightSignals(snapshot, locale),
      trend: buildStripeTrend(stripeInsight.transactions, stripeInsight.refunds, period, stripeInsight.activeCurrency, locale),
    };
  }
  if (stripeInsight.snapshot && stripeInsight.activeCurrency) {
    stripeInsight = {
      ...stripeInsight,
      signals: buildStripeInsightSignals(stripeInsight.snapshot, locale),
      trend: buildStripeTrend(stripeInsight.transactions, stripeInsight.refunds, period, stripeInsight.activeCurrency, locale),
    };
  }
  return stripeInsight;
}

async function FailedPaymentsAttentionLoader({
  accountId,
  connection,
  period,
  requestedCurrency,
  pending,
  locale,
  items,
  acknowledgedStripeChargeIds,
}: {
  accountId: string;
  connection: { stripeAccountId: string } | null;
  period: ResolvedPeriod;
  requestedCurrency: string | null | undefined;
  pending: number;
  locale: string;
  items: FailedPaymentItem[];
  acknowledgedStripeChargeIds: readonly string[];
}) {
  const stripeInsight = await loadStripeInsightData({ accountId, connection, period, requestedCurrency, pending, locale });
  const acknowledgedCharges = new Set(acknowledgedStripeChargeIds);
  const unprocessedTransactions = stripeInsight?.transactions.filter(
    (transaction) => transaction.status !== "failed" || !acknowledgedCharges.has(transaction.id),
  ) ?? [];
  const unprocessedSnapshot = stripeInsight?.snapshot && stripeInsight.activeCurrency
    ? buildStripeInsightSnapshot(
        unprocessedTransactions,
        stripeInsight.refunds,
        period,
        stripeInsight.activeCurrency,
      )
    : null;
  const stripeFailureSignal = unprocessedSnapshot ? buildStripeFailureSignal(unprocessedSnapshot, locale) : null;
  return <FailedPaymentsPanel items={items} signal={stripeFailureSignal} />;
}

export default async function SuiviDesVentesPage({ searchParams }: { searchParams: Promise<{ period?: string; currency?: string }> }) {
  const t = await getTranslations("sales");
  const integrationsT = await getTranslations("app.integrations");
  const locale = await getLocale();
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:suivi");
  const stripeConnected = Boolean(user?.stripeConnectId);
  const query = await searchParams;
  const period = resolvePeriod(query.period);
  const [sales, profile, setters, closers, [connection], youtubeInsights] = await Promise.all([
    getSales(accountId),
    getBusinessProfile(accountId),
    getSetters(accountId),
    getActiveClosers(accountId),
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
      .filter(({ installment }) => installment.status === "failed" && !installment.acknowledgedAt)
      .map(({ installment, index }) => ({
        id: `${sale.id}-${index}`,
        saleId: sale.id,
        installmentIndex: index,
        client: sale.isOrphan ? t("paymentToAttach") : sale.clientName,
        amount: installment.amount,
        reason: installment.failureReason ?? t("paymentFailed"),
        dueDate: installment.dueDate,
        attempts: 1,
      }))
  );
  const acknowledgedStripeChargeIds = sales.flatMap((sale) =>
    (sale.installments ?? [])
      .filter((installment) => installment.status === "failed" && Boolean(installment.acknowledgedAt))
      .map((installment) => installment.stripeChargeId)
      .filter((chargeId): chargeId is string => Boolean(chargeId)),
  );

  const periodSales = sales.filter((sale) => isInPeriod(period, dateFromDayString(sale.saleDate)));
  const validPeriodSales = periodSales.filter((sale) => !sale.isOrphan);

  const cashContracted = validPeriodSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const summaries = validPeriodSales.map((sale) => summarize(sale.totalPrice, sale.installments));
  const cashCollected = summaries.reduce((sum, summary) => sum + summary.paidTotal, 0);
  const pending = summaries.reduce((sum, summary) => sum + summary.pendingTotal, 0);
  const failed = summaries.reduce((sum, summary) => sum + summary.failedTotal, 0);
  const refunded = summaries.reduce((sum, summary) => sum + summary.refundedTotal, 0);
  const stripeInsight = await loadStripeInsightData({
    accountId,
    connection: connection ? { stripeAccountId: connection.stripeAccountId } : null,
    period,
    requestedCurrency: query.currency,
    pending,
    locale,
  });
  const forecast = buildUpcomingPaymentForecast(sales);

  const stateText =
    periodSales.length > 0
      ? t("stateWithSales", { count: periodSales.length, amount: new Intl.NumberFormat(locale).format(cashCollected) })
      : t("stateNoSales");
  // No MetricKey for Suivi des ventes in the Copilote pipeline — general topic.
  const chatContext: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "ventes_suivi" };

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner stateText={stateText} ctaLabel={t("improve")} chatContext={chatContext} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{t("title")}</h2>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter current={period.key} />
          <SaleFormDialog
            offers={offers}
            setters={setters}
            closers={closers}
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

      <section aria-labelledby="sales-sources-title" className="flex flex-col gap-3">
        <div>
          <h3 id="sales-sources-title" className="text-lg font-bold">{t("dataSourcesTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("dataSourcesHelp")}</p>
        </div>
        {stripeConnected ? (
          <ConnectedIntegrationRow
            id="stripe"
            name={t("stripe")}
            detail={t("stripeConnectedLine")}
            refreshKind="stripe"
            disconnectKind="stripe"
            connectedLabel={integrationsT("connected")}
            refreshLabel={integrationsT("refresh")}
            refreshingLabel={integrationsT("refreshing")}
            refreshDoneLabel={() => integrationsT("refreshDone")}
            disconnectLabel={integrationsT("disconnect")}
          />
        ) : (
          <IntegrationStatusRow
            name={t("stripe")}
            status="not_connected"
            detail={t("stripeDisconnected")}
            showStatusLabel={false}
            action={<Button asChild variant="outline" size="sm" className="min-h-11"><Link href="/integrations#stripe">{t("connect")}</Link></Button>}
          />
        )}
        <StripeInsightsSection
          connected={stripeConnected}
          connection={connection ? {
            initialSyncStatus: connection.initialSyncStatus,
            lastSyncStartedAt: connection.lastSyncStartedAt?.toISOString() ?? null,
            lastSyncCompletedAt: connection.lastSyncCompletedAt?.toISOString() ?? null,
            lastSyncError: connection.lastSyncError,
          } : null}
          availableCurrencies={stripeInsight?.availableCurrencies ?? []}
          activeCurrency={stripeInsight?.activeCurrency ?? null}
          snapshot={stripeInsight?.snapshot ?? null}
          trend={stripeInsight?.trend ?? []}
        />
      </section>

      <FailedPaymentsAttentionLoader
        accountId={accountId}
        connection={connection ? { stripeAccountId: connection.stripeAccountId } : null}
        period={period}
        requestedCurrency={query.currency}
        pending={pending}
        locale={locale}
        items={failedPaymentItems}
        acknowledgedStripeChargeIds={acknowledgedStripeChargeIds}
      />

      <section aria-labelledby="sales-overview-title">
        <div className="mb-3">
          <h3 id="sales-overview-title" className="text-lg font-bold">{t("overviewTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("overviewHelp")}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiTile label={t("contractedRevenue")} value={`${new Intl.NumberFormat(locale).format(cashContracted)} €`} detail={t("salesCount", { count: validPeriodSales.length })} />
          <KpiTile label={t("collectedRevenue")} value={`${new Intl.NumberFormat(locale).format(cashCollected)} €`} detail={t("salesCount", { count: validPeriodSales.length })} tone="positive" />
          <KpiTile label={t("upcomingPayments")} value={`${new Intl.NumberFormat(locale).format(pending)} €`} detail={t("toCollect")} tone="accent2" />
          <KpiTile label={t("failedPayments")} value={`${new Intl.NumberFormat(locale).format(failed)} €`} detail={t("toProcess")} tone={failed > 0 ? "negative" : "default"} />
          <KpiTile label={t("refundedRevenue")} value={`${new Intl.NumberFormat(locale).format(refunded)} €`} detail={t("refunded")} tone={refunded > 0 ? "warning" : "default"} />
        </div>
      </section>

      <UpcomingPaymentsForecast items={forecast} locale={locale} />

      <section id="sales-ledger" className="scroll-mt-6" aria-labelledby="sales-ledger-title">
        <div className="mb-3">
          <h3 id="sales-ledger-title" className="text-lg font-bold">{t("ledgerTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("ledgerHelp")}</p>
        </div>
        <SalesTable
          sales={periodSales}
          allSales={sales}
          setters={setters}
          closers={closers}
          offers={offers}
          stripeTransactions={stripeInsight?.visibleTransactions ?? []}
          stripeConnection={connection ? { accountId: connection.stripeAccountId, livemode: connection.livemode } : null}
        />
      </section>
    </div>
  );
}
