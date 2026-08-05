"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { acknowledgeFailedInstallment } from "./actions";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

export type FailedPaymentItem = {
  saleId: string;
  installmentIndex: number;
  clientName: string;
  amount: number;
  dueDate: string;
  failureReason: string;
  stripeDashboardUrl: string | null;
};

export function FailedPaymentsBanner({ items }: { items: FailedPaymentItem[] }) {
  const [isPending, startTransition] = useTransition();

  if (items.length === 0) return null;

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  function acknowledge(item: FailedPaymentItem) {
    startTransition(async () => {
      await acknowledgeFailedInstallment(item.saleId, item.installmentIndex);
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-state-critical/40 bg-state-critical/10 p-5">
      <p className="font-bold text-state-critical">
        {items.length} paiement{items.length > 1 ? "s" : ""} Stripe échoué{items.length > 1 ? "s" : ""}
      </p>
      <p className="mt-1 text-sm text-state-critical/90">
        {NUMBER_FORMAT.format(total)} € à recouvrer — une action est nécessaire pour ne pas perdre ces ventes.
      </p>

      <ul className="mt-4 flex flex-col gap-1">
        {items.map((item) => (
          <li
            key={`${item.saleId}-${item.installmentIndex}`}
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-control)] bg-background/60 px-4 py-3 text-sm"
          >
            <span className="flex-1 min-w-[120px] font-bold">{item.clientName}</span>
            <span className="w-24 font-bold tabular-nums">{NUMBER_FORMAT.format(item.amount)} €</span>
            <span className="w-28 text-muted-foreground">{item.dueDate}</span>
            <span className="flex-1 min-w-[140px] text-muted-foreground">{item.failureReason}</span>
            <div className="flex items-center gap-1.5">
              {item.stripeDashboardUrl && (
                <Button asChild variant="link" size="sm">
                  <a href={item.stripeDashboardUrl} target="_blank" rel="noopener noreferrer">
                    Voir sur Stripe →
                  </a>
                </Button>
              )}
              <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={() => acknowledge(item)}>
                Marquer comme traité
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
