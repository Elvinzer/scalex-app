import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { AgentBanner } from "@/components/agent-banner";
import { FailedPaymentsPanel, type FailedPaymentItem } from "@/components/failed-payments-panel";
import { IntegrationStatusRow } from "@/components/integration-status-row";
import { KpiTile } from "@/components/kpi-tile";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { getSetters } from "@/lib/setters/queries";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { SaleFormDialog } from "./sale-form-dialog";
import { SalesTable } from "./sales-table";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export default async function SuiviDesVentesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:suivi");
  const stripeConnected = Boolean(user?.stripeConnectId);
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
        client: sale.isOrphan ? "Paiement à rattacher" : sale.clientName,
        amount: installment.amount,
        reason: installment.failureReason ?? "Paiement Stripe refusé",
        dueDate: installment.dueDate,
        attempts: 1,
      }))
  );

  const period = resolvePeriod((await searchParams).period);
  const periodSales = sales.filter((sale) => isInPeriod(period, dateFromDayString(sale.saleDate)));

  const cashContracted = periodSales.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const summaries = periodSales.map((sale) => summarize(sale.totalPrice, sale.installments));
  const cashCollected = summaries.reduce((sum, summary) => sum + summary.paidTotal, 0);
  const pending = summaries.reduce((sum, summary) => sum + summary.pendingTotal, 0);
  const failed = summaries.reduce((sum, summary) => sum + summary.failedTotal, 0);

  const stateText =
    periodSales.length > 0
      ? `${periodSales.length} vente${periodSales.length > 1 ? "s" : ""} sur la période, ${NUMBER_FORMAT.format(cashCollected)} € encaissé.`
      : "Aucune vente sur cette période.";
  // No MetricKey for Suivi des ventes in the Copilote pipeline — general topic.
  const chatContext: ChatContext = { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "ventes_suivi" };

  return (
    <div className="flex flex-col gap-8">
      {stripeConnected && <FailedPaymentsPanel items={failedPaymentItems} />}

      <AgentBanner stateText={stateText} ctaLabel="Améliorer →" chatContext={chatContext} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi des ventes</h1>
          <p className="mt-1 text-muted-foreground">
            Chaque vente, avec son échéancier et ses impayés, au-delà des seuls totaux du funnel.
          </p>
          <div className="mt-3">
            <IntegrationStatusRow
              name="Stripe"
              status={stripeConnected ? "connected" : "not_connected"}
              detail={stripeConnected ? "Les paiements alimentent ce suivi automatiquement." : "Connecte Stripe pour synchroniser tes paiements."}
              action={
                <Button asChild variant="outline" size="sm">
                  <a href="/settings">{stripeConnected ? "Gérer" : "Connecter"}</a>
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
                Ajouter une vente
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="CA contracté" value={`${NUMBER_FORMAT.format(cashContracted)} €`} detail={`${periodSales.length} ventes`} />
        <KpiTile label="CA encaissé" value={`${NUMBER_FORMAT.format(cashCollected)} €`} detail={`${periodSales.length} ventes`} tone="positive" />
        <KpiTile label="Échéances à venir" value={`${NUMBER_FORMAT.format(pending)} €`} detail="À encaisser" tone="accent2" />
        <KpiTile label="Impayés" value={`${NUMBER_FORMAT.format(failed)} €`} detail="À traiter" tone={failed > 0 ? "negative" : "default"} />
      </div>

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
