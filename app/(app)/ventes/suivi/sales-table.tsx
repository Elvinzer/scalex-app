"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge, type MetricSource } from "@/components/source-badge";
import type { Offer } from "@/lib/business/types";
import { displayInstallments, summarize } from "@/lib/sales/installments";
import type { OverallSaleStatus, PaymentType, SaleRow } from "@/lib/sales/types";
import type { SetterRow } from "@/lib/setters/types";

import { removeSale } from "./actions";
import { SaleDetailDrawer } from "./sale-detail-drawer";
import { SaleFormDialog } from "./sale-form-dialog";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  stripe: "Stripe",
  virement: "Virement",
};

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  one_shot: "One-shot",
  installments: "Échelonné",
  subscription: "Abonnement",
};

type DealDisplayRow = {
  sale: SaleRow;
  summary: ReturnType<typeof summarize>;
  nextInstallment: ReturnType<typeof displayInstallments>[number]["installment"] | null;
  installmentCount: number;
};

function statusRank(sale: SaleRow, status: OverallSaleStatus): number {
  if (sale.isOrphan) return 0;
  if (status === "failed") return 1;
  if (status === "refunded") return 2;
  if (status === "in_progress") return 3;
  return 4;
}

function statusLabel(sale: SaleRow, status: OverallSaleStatus): string {
  if (sale.isOrphan) return "À rattacher";
  if (status === "failed") return "Paiement échoué";
  if (status === "refunded") return "Remboursé";
  if (status === "in_progress") return sale.paymentMethod === "virement" ? "Virement attendu" : "Échéance à venir";
  return "Soldé";
}

function sourceForSale(sale: SaleRow): MetricSource {
  if (sale.source === "stripe") return "Stripe";
  const channel = sale.sourceChannel?.toLocaleLowerCase("fr-FR") ?? "";
  if (channel.includes("calendly")) return "Calendly";
  if (channel.includes("iclosed")) return "iClosed";
  return "Saisie";
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
        const matchesStatus = statusFilter === "orphan" ? sale.isOrphan : displayInstallments(sale.totalPrice, sale.saleDate, sale.installments).some(({ installment }) => installment.status === statusFilter);
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
    const rows: DealDisplayRow[] = [];
    for (const sale of filtered) {
      const summary = summarize(sale.totalPrice, sale.installments);
      const saleRows = displayInstallments(sale.totalPrice, sale.saleDate, sale.installments);
      rows.push({ sale, summary, nextInstallment: saleRows.find(({ installment }) => installment.status === "upcoming")?.installment ?? null, installmentCount: saleRows.length });
    }

    rows.sort((a, b) => {
      const rankDelta = statusRank(a.sale, a.summary.overallStatus) - statusRank(b.sale, b.summary.overallStatus);
      if (rankDelta !== 0) return rankDelta;
      return b.sale.saleDate.localeCompare(a.sale.saleDate);
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
        <>
          <div className="sticker-card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">Deal</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Nature</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">Encaissé</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Prochaine échéance</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Source</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Setter</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Closer</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(({ sale, summary, nextInstallment, installmentCount }) => (
                <tr
                  key={sale.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                  onClick={() => setSelectedId(sale.id)}
                >
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{sale.saleDate}</td>
                  <td className="p-3 font-bold">{sale.isOrphan ? "À identifier" : sale.clientName}</td>
                  <td className="p-3 text-right font-bold tabular-nums">{NUMBER_FORMAT.format(sale.totalPrice)} €</td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {sale.paymentType === "installments" ? `Échéancier · ${installmentCount} fois` : PAYMENT_TYPE_LABEL[sale.paymentType]}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{NUMBER_FORMAT.format(summary.paidTotal)} €</td>
                  <td className="p-3 text-muted-foreground">{nextInstallment ? `${nextInstallment.dueDate} · ${NUMBER_FORMAT.format(nextInstallment.amount)} €` : "—"}</td>
                  <td className="p-3"><SourceBadge source={sourceForSale(sale)} /></td>
                  <td className="p-3 text-muted-foreground">{setterName(sale.setterId)}</td>
                  <td className="p-3 text-muted-foreground">{sale.closer ?? "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={statusLabel(sale, summary.overallStatus)} />
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
          <div className="flex flex-col gap-3 md:hidden">
            {displayRows.map(({ sale, summary, nextInstallment, installmentCount }) => (
              <article key={sale.id} className="sticker-card flex flex-col gap-3 p-4" onClick={() => setSelectedId(sale.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{sale.isOrphan ? "À identifier" : sale.clientName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{sale.saleDate} · {PAYMENT_METHOD_LABEL[sale.paymentMethod]}</p>
                  </div>
                  <StatusBadge status={statusLabel(sale, summary.overallStatus)} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Deal</p><p className="font-bold tabular-nums">{NUMBER_FORMAT.format(sale.totalPrice)} €</p></div>
                  <div><p className="text-xs text-muted-foreground">Encaissé</p><p className="font-bold tabular-nums">{NUMBER_FORMAT.format(summary.paidTotal)} €</p></div>
                  <div><p className="text-xs text-muted-foreground">Nature</p><p className="font-bold">{sale.paymentType === "installments" ? `${installmentCount} échéances` : PAYMENT_TYPE_LABEL[sale.paymentType]}</p></div>
                  <div><p className="text-xs text-muted-foreground">Prochaine échéance</p><p className="font-bold">{nextInstallment?.dueDate ?? "—"}</p></div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <SourceBadge source={sourceForSale(sale)} />
                  {sale.isOrphan ? (
                    <SaleFormDialog
                      offers={offers}
                      setters={setters}
                      sale={sale}
                      trigger={<Button type="button" variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>Créer la vente</Button>}
                    />
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); handleDelete(sale.id); }}>
                      Supprimer
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
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
