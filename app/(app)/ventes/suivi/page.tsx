import { eq } from "drizzle-orm";
import { Plus } from "lucide-react";

import { AgentBanner } from "@/components/agent-banner";
import { PeriodFilter } from "@/components/period-filter";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { stripeDashboardChargeUrl } from "@/lib/stripe/dashboard-url";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { getSetters } from "@/lib/setters/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import type { FailedPaymentItem } from "./failed-payments-banner";
import { FailedPaymentsBanner } from "./failed-payments-banner";
import { SaleFormDialog } from "./sale-form-dialog";
import { SalesTable } from "./sales-table";
import { StripeStatusLine } from "./stripe-status-line";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export default async function SuiviDesVentesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:suivi");
  const stripeConnected = Boolean(user?.stripeConnectId);
  const [sales, profile, setters, [connection]] = await Promise.all([
    getSales(accountId),
    getBusinessProfile(accountId),
    getSetters(accountId),
    stripeConnected
      ? db.select().from(stripeConnections).where(eq(stripeConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
  ]);
  const offers = profile.sales.offers;

  // Account-wide, not period-scoped — a failed payment needing action
  // shouldn't fall out of view just because the period tabs above narrow to
  // a month that doesn't contain it.
  const failedPaymentItems: FailedPaymentItem[] = sales.flatMap((sale) => {
    if (!sale.installments) return [];
    return sale.installments.flatMap((installment, index) => {
      if (installment.status !== "failed" || installment.acknowledgedAt) return [];
      return [
        {
          saleId: sale.id,
          installmentIndex: index,
          clientName: sale.clientName,
          amount: installment.amount,
          dueDate: installment.dueDate,
          failureReason: installment.failureReason ?? "Paiement refusé",
          stripeDashboardUrl:
            installment.stripeChargeId && connection
              ? stripeDashboardChargeUrl(connection.stripeAccountId, installment.stripeChargeId, connection.livemode)
              : null,
        },
      ];
    });
  });

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
      {stripeConnected && <FailedPaymentsBanner items={failedPaymentItems} />}

      <AgentBanner stateText={stateText} ctaLabel="Améliorer →" chatContext={chatContext} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi des ventes</h1>
          <p className="mt-1 text-muted-foreground">
            Chaque vente, avec son échéancier et ses impayés, au-delà des seuls totaux du funnel.
          </p>
          <div className="mt-3">
            <StripeStatusLine connected={stripeConnected} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter current={period.key} />
          <SaleFormDialog
            offers={offers}
            setters={setters}
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
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CA contracté</p>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(cashContracted)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">CA encaissé</p>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(cashCollected)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Paiements en attente</p>
          <p className="mt-2 font-display text-3xl font-bold">{NUMBER_FORMAT.format(pending)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Impayés</p>
          <p className={`mt-2 font-display text-3xl font-bold ${failed > 0 ? "text-state-critical" : ""}`}>
            {NUMBER_FORMAT.format(failed)} €
          </p>
        </div>
      </div>

      <SalesTable
        sales={periodSales}
        setters={setters}
        offers={offers}
        stripeConnection={connection ? { accountId: connection.stripeAccountId, livemode: connection.livemode } : null}
      />
    </div>
  );
}
