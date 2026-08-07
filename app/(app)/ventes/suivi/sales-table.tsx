"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/business/types";
import { displayInstallments, summarize } from "@/lib/sales/installments";
import type { InstallmentStatus, PaymentType, SaleRow } from "@/lib/sales/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { removeSale } from "./actions";
import { SaleDetailDrawer } from "./sale-detail-drawer";
import { SaleFormDialog } from "./sale-form-dialog";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const STATUS_BADGE: Record<InstallmentStatus, string> = {
  upcoming: "bg-warning-soft text-warning-text",
  paid: "bg-positive-soft text-positive",
  failed: "bg-state-critical/10 text-state-critical",
  refunded: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<InstallmentStatus, string> = {
  upcoming: "À venir",
  paid: "Payé",
  failed: "Impayé",
  refunded: "Remboursé",
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  stripe: "Stripe",
  virement: "Virement",
};

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  one_shot: "One-shot",
  installments: "Échelonné",
  subscription: "Abonnement",
};

type DisplayRow = {
  sale: SaleRow;
  installment: ReturnType<typeof displayInstallments>[number]["installment"];
  installmentIndex: number;
  installmentCount: number;
  remaining: number | null;
};

function statusRank(sale: SaleRow, status: InstallmentStatus): number {
  if (sale.isOrphan) return 0;
  if (status === "failed") return 1;
  if (status === "refunded") return 2;
  if (status === "upcoming") return 3;
  return 4;
}

export function SalesTable({
  sales,
  allSales,
  setters,
  offers,
  stripeConnection,
}: {
  sales: SaleRow[];
  allSales: SaleRow[];
  setters: SetterRow[];
  offers: Offer[];
  stripeConnection?: { accountId: string; livemode: boolean } | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (sales.find((sale) => sale.id === selectedId) ?? null) : null;
  const [setterFilter, setSetterFilter] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () =>
      sales.filter((sale) => {
        const rows = displayInstallments(sale.totalPrice, sale.saleDate, sale.installments);
        const matchesStatus = statusFilter === "orphan" ? sale.isOrphan : rows.some(({ installment }) => installment.status === statusFilter);
        return (
          (!setterFilter || sale.setterId === setterFilter) &&
          (!paymentMethodFilter || sale.paymentMethod === paymentMethodFilter) &&
          (!paymentTypeFilter || sale.paymentType === paymentTypeFilter) &&
          (!statusFilter || matchesStatus)
        );
      }),
    [sales, setterFilter, paymentMethodFilter, paymentTypeFilter, statusFilter]
  );

  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = [];
    for (const sale of filtered) {
      const summary = summarize(sale.totalPrice, sale.installments);
      const saleRows = displayInstallments(sale.totalPrice, sale.saleDate, sale.installments);
      const remaining = sale.paymentType === "installments" ? Math.max(0, sale.totalPrice - summary.paidTotal) : null;
      for (const { installment, index } of saleRows) {
        rows.push({ sale, installment, installmentIndex: index, installmentCount: saleRows.length, remaining });
      }
    }

    rows.sort((a, b) => {
      const rankDelta = statusRank(a.sale, a.installment.status) - statusRank(b.sale, b.installment.status);
      if (rankDelta !== 0) return rankDelta;
      return b.installment.dueDate.localeCompare(a.installment.dueDate);
    });
    return rows;
  }, [filtered]);

  function handleDelete(id: string) {
    startTransition(async () => {
      await removeSale(id);
    });
  }

  function setterName(setterId: string | null): string {
    if (!setterId) return "—";
    return setters.find((s) => s.id === setterId)?.name ?? "—";
  }

  if (sales.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucune vente enregistrée pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Ajoute ta première vente ci-dessus.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {setters.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Filtrer par setter</span>
            <select
              value={setterFilter}
              onChange={(event) => setSetterFilter(event.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">Tous</option>
              {setters.map((setter) => (
                <option key={setter.id} value={setter.id}>
                  {setter.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Moyen de paiement</span>
          <select
            value={paymentMethodFilter}
            onChange={(event) => setPaymentMethodFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">Tous</option>
            <option value="stripe">Stripe</option>
            <option value="virement">Virement</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Nature</span>
          <select
            value={paymentTypeFilter}
            onChange={(event) => setPaymentTypeFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">Toutes</option>
            <option value="one_shot">One-shot</option>
            <option value="installments">Échéancier</option>
            <option value="subscription">Abonnement</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Statut</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">Tous</option>
            <option value="paid">Payé</option>
            <option value="upcoming">À venir</option>
            <option value="failed">Impayé</option>
            <option value="refunded">Remboursé</option>
            <option value="orphan">À rattacher</option>
          </select>
        </label>
      </div>

      {displayRows.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune ligne ne correspond à ces filtres.</p>
          <p className="mt-1 text-sm text-muted-foreground">Réinitialise un filtre pour retrouver les paiements.</p>
        </div>
      ) : (
        <div className="sticker-card overflow-x-auto">
          <table className="w-full min-w-[1060px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">Montant</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Nature</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">Reste à payer</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Paiement</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Source</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Setter</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Closer</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ sale, installment, installmentIndex, installmentCount, remaining }) => (
                <tr
                  key={`${sale.id}-${installmentIndex}`}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  onClick={() => setSelectedId(sale.id)}
                >
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{installment.dueDate}</td>
                  <td className="p-3 font-bold">{sale.isOrphan ? "À identifier" : sale.clientName}</td>
                  <td className="p-3 text-right tabular-nums">{NUMBER_FORMAT.format(installment.amount)} €</td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {sale.paymentType === "installments"
                        ? `Échéancier ${installmentIndex + 1}/${installmentCount}`
                        : PAYMENT_TYPE_LABEL[sale.paymentType]}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums text-muted-foreground">
                    {remaining === null ? "—" : `${NUMBER_FORMAT.format(remaining)} €`}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {PAYMENT_METHOD_LABEL[sale.paymentMethod]}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground">{sale.source === "stripe" ? "Stripe" : sale.sourceChannel ?? "—"}</td>
                  <td className="p-3 text-muted-foreground">{setterName(sale.setterId)}</td>
                  <td className="p-3 text-muted-foreground">{sale.closer ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {sale.isOrphan && (
                        <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning-text">À rattacher</span>
                      )}
                      {!sale.isOrphan && (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[installment.status])}>
                          {STATUS_LABEL[installment.status]}
                        </span>
                      )}
                      {sale.isOrphan && installment.status === "refunded" && (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE.refunded)}>Remboursé</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    {sale.isOrphan ? (
                      <SaleFormDialog
                        offers={offers}
                        setters={setters}
                        sale={sale}
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Créer la vente
                          </Button>
                        }
                      />
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(sale.id);
                        }}
                      >
                        Supprimer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SaleDetailDrawer
        sale={selected}
        allSales={allSales}
        offers={offers}
        setters={setters}
        stripeConnection={stripeConnection}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </>
  );
}
