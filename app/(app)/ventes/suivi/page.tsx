import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";

import { SaleFormDialog } from "./sale-form-dialog";
import { SalesTable } from "./sales-table";

function currentMonthPrefix(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export default async function SuiviDesVentesPage() {
  const { userId } = await getCurrentUser();
  const [sales, profile] = await Promise.all([getSales(userId), getBusinessProfile(userId)]);
  const offers = profile.sales.offers;

  const monthPrefix = currentMonthPrefix();
  const salesThisMonth = sales.filter((sale) => sale.saleDate.startsWith(monthPrefix));

  const cashContracted = salesThisMonth.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const summaries = salesThisMonth.map((sale) => summarize(sale.totalPrice, sale.installments));
  const cashCollected = summaries.reduce((sum, summary) => sum + summary.paidTotal, 0);
  const pending = summaries.reduce((sum, summary) => sum + summary.pendingTotal, 0);
  const failed = summaries.reduce((sum, summary) => sum + summary.failedTotal, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Suivi des ventes</h1>
          <p className="mt-1 text-muted-foreground">
            Chaque vente, son échéancier et ses impayés — au-delà des seuls totaux du funnel.
          </p>
        </div>
        <SaleFormDialog
          offers={offers}
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              Ajouter une vente
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">CA contracté ce mois</p>
          <p className="mt-2 font-display text-3xl font-medium">{NUMBER_FORMAT.format(cashContracted)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">CA encaissé ce mois</p>
          <p className="mt-2 font-display text-3xl font-medium">{NUMBER_FORMAT.format(cashCollected)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Paiements en attente</p>
          <p className="mt-2 font-display text-3xl font-medium">{NUMBER_FORMAT.format(pending)} €</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-medium text-muted-foreground">Impayés</p>
          <p className={`mt-2 font-display text-3xl font-medium ${failed > 0 ? "text-state-critical" : ""}`}>
            {NUMBER_FORMAT.format(failed)} €
          </p>
        </div>
      </div>

      <SalesTable sales={sales} />
    </div>
  );
}
