"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { Offer } from "@/lib/business/types";
import { displayInstallments, summarize } from "@/lib/sales/installments";
import type { InstallmentStatus, SaleRow } from "@/lib/sales/types";
import { stripeDashboardChargeUrl } from "@/lib/stripe/dashboard-url";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { acknowledgeFailedInstallment, setInstallmentStatus } from "./actions";
import { SaleFormDialog } from "./sale-form-dialog";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const STATUS_LABELS: Record<InstallmentStatus, string> = {
  upcoming: "À venir",
  paid: "Payée",
  failed: "Échouée",
  refunded: "Remboursée",
};

export function SaleDetailDrawer({
  sale,
  allSales,
  offers,
  setters,
  stripeConnection,
  open,
  onOpenChange,
}: {
  sale: SaleRow | null;
  allSales: SaleRow[];
  offers: Offer[];
  setters: SetterRow[];
  stripeConnection?: { accountId: string; livemode: boolean } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!sale) return null;

  const summary = summarize(sale.totalPrice, sale.installments);
  const relatedSales = allSales.filter((candidate) => {
    if (candidate.id === sale.id) return true;
    if (!sale.clientEmail || !candidate.clientEmail) return false;
    return candidate.clientEmail.trim().toLowerCase() === sale.clientEmail.trim().toLowerCase();
  });
  const hasFiniteSchedule = relatedSales.some((candidate) => candidate.paymentType === "installments");
  const aggregatedRemaining = relatedSales.reduce((total, candidate) => {
    if (candidate.paymentType !== "installments") return total;
    const candidateSummary = summarize(candidate.totalPrice, candidate.installments);
    return total + Math.max(0, candidate.totalPrice - candidateSummary.paidTotal);
  }, 0);
  const offerName = offers.find((o) => o.id === sale.offerId)?.name ?? null;
  const setterName = sale.setterId ? (setters.find((s) => s.id === sale.setterId)?.name ?? null) : null;

  function toggleStatus(index: number, status: "paid" | "failed") {
    if (!sale) return;
    startTransition(async () => {
      await setInstallmentStatus(sale.id, index, status);
    });
  }

  function acknowledge(index: number) {
    if (!sale) return;
    startTransition(async () => {
      await acknowledgeFailedInstallment(sale.id, index);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border p-5">
          <DrawerTitle className="text-lg font-bold">{sale.clientName}</DrawerTitle>
          <div className="flex items-center gap-1">
            <SaleFormDialog offers={offers} setters={setters} sale={sale} trigger={<Button type="button" variant="outline" size="sm">Modifier</Button>} />
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer">
                ×
              </Button>
            </DrawerClose>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {offerName && <span>{offerName}</span>}
            {sale.sourceChannel && <span>Source : {sale.sourceChannel}</span>}
            {setterName && <span>Setter : {setterName}</span>}
            {sale.closer && <span>Closer : {sale.closer}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">Payé</p>
              <p className="mt-1 font-display text-xl font-bold">{summary.paidTotal} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">En attente</p>
              <p className="mt-1 font-display text-xl font-bold">{summary.pendingTotal} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">Impayé</p>
              <p className={cn("mt-1 font-display text-xl font-bold", summary.failedTotal > 0 && "text-state-critical")}>
                {summary.failedTotal} €
              </p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">Reste à payer</p>
              <p className="mt-1 font-display text-xl font-bold">
                {hasFiniteSchedule ? `${NUMBER_FORMAT.format(aggregatedRemaining)} €` : "—"}
              </p>
            </div>
          </div>

          {summary.nextDue && <p className="text-sm text-muted-foreground">Prochaine échéance : {summary.nextDue}</p>}

          {sale.isOrphan && (
            <div className="rounded-[var(--radius-control)] bg-warning-soft p-4">
              <p className="text-sm font-bold text-warning-text">Ce paiement Stripe est à rattacher à une vente.</p>
              <p className="mt-1 text-sm text-warning-text">Le montant, la date et l&apos;email sont déjà pré-remplis.</p>
              <div className="mt-3">
                <SaleFormDialog
                  offers={offers}
                  setters={setters}
                  sale={sale}
                  trigger={<Button type="button" variant="outline" size="sm">Créer la vente</Button>}
                />
              </div>
            </div>
          )}

          {displayInstallments(sale.totalPrice, sale.saleDate, sale.installments).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold">Échéances</p>
              <ul className="flex flex-col gap-2">
                {displayInstallments(sale.totalPrice, sale.saleDate, sale.installments).map(({ installment, index }) => (
                  <li key={index} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold">{installment.amount} €</p>
                        <p className="text-xs text-muted-foreground">
                          {installment.dueDate} — {STATUS_LABELS[installment.status]}
                        </p>
                      </div>
                      {installment.status !== "paid" && installment.status !== "refunded" && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => toggleStatus(index, "paid")}
                          >
                            Marquer payée
                          </Button>
                          {installment.status !== "failed" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() => toggleStatus(index, "failed")}
                            >
                              Marquer échouée
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {installment.status === "failed" && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-state-critical/10 px-3 py-2">
                        <p className="text-xs font-bold text-state-critical">
                          {installment.failureReason ?? "Paiement refusé"}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {installment.stripeChargeId && stripeConnection && (
                            <Button asChild variant="link" size="sm">
                              <a
                                href={stripeDashboardChargeUrl(stripeConnection.accountId, installment.stripeChargeId, stripeConnection.livemode)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Voir sur Stripe →
                              </a>
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant={installment.acknowledgedAt ? "ghost" : "destructive"}
                            size="sm"
                            disabled={isPending || Boolean(installment.acknowledgedAt)}
                            onClick={() => acknowledge(index)}
                          >
                            {installment.acknowledgedAt ? "Traité ✓" : "Marquer comme traité"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {installment.status === "refunded" && (
                      <div className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
                        Remboursement enregistré sur Stripe.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
