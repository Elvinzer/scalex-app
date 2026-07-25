"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Offer } from "@/lib/business/types";
import { summarize } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { removeSale } from "./actions";
import { SaleDetailDrawer } from "./sale-detail-drawer";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

const STATUS_BADGE: Record<string, string> = {
  paid_full: "bg-positive-soft text-positive",
  in_progress: "bg-warning-soft text-warning-text",
  failed: "bg-state-critical/10 text-state-critical",
};

const STATUS_LABEL: Record<string, string> = {
  paid_full: "Payé intégralement",
  in_progress: "En cours",
  failed: "Échéance échouée",
};

export function SalesTable({ sales, setters, offers }: { sales: SaleRow[]; setters: SetterRow[]; offers: Offer[] }) {
  // Tracks only the id, not the sale object itself — so after an edit
  // revalidates `sales` from the server, the drawer re-derives the fresh
  // row below instead of showing the stale snapshot captured at click time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? (sales.find((sale) => sale.id === selectedId) ?? null) : null;
  const [setterFilter, setSetterFilter] = useState("");
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (setterFilter ? sales.filter((sale) => sale.setterId === setterFilter) : sales),
    [sales, setterFilter]
  );

  const sorted = useMemo(() => {
    const withSummary = filtered.map((sale) => ({ sale, summary: summarize(sale.totalPrice, sale.installments) }));
    withSummary.sort((a, b) => {
      const rank = (status: string) => (status === "failed" ? 0 : status === "in_progress" ? 1 : 2);
      return rank(a.summary.overallStatus) - rank(b.summary.overallStatus);
    });
    return withSummary;
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
      {setters.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
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
        </div>
      )}

      <div className="sticker-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
              <th className="p-3 text-right text-xs font-bold text-muted-foreground">Prix</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Source</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Setter</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Closer</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ sale, summary }) => (
              <tr
                key={sale.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                onClick={() => setSelectedId(sale.id)}
              >
                <td className="p-3 whitespace-nowrap text-muted-foreground">{sale.saleDate}</td>
                <td className="p-3 font-bold">{sale.clientName}</td>
                <td className="p-3 text-right tabular-nums">{NUMBER_FORMAT.format(sale.totalPrice)} €</td>
                <td className="p-3 text-muted-foreground">{sale.sourceChannel ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{setterName(sale.setterId)}</td>
                <td className="p-3 text-muted-foreground">{sale.closer ?? "—"}</td>
                <td className="p-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[summary.overallStatus])}>
                    {STATUS_LABEL[summary.overallStatus]}
                  </span>
                </td>
                <td className="p-3 text-right">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SaleDetailDrawer sale={selected} offers={offers} setters={setters} open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)} />
    </>
  );
}
