"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { summarize } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";
import { cn } from "@/lib/utils";

import { setInstallmentStatus } from "./actions";

const STATUS_LABELS: Record<string, string> = {
  upcoming: "À venir",
  paid: "Payée",
  failed: "Échouée",
};

export function SaleDetailDrawer({ sale, open, onOpenChange }: { sale: SaleRow | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [isPending, startTransition] = useTransition();

  if (!sale) return null;

  const summary = summarize(sale.totalPrice, sale.installments);

  function toggleStatus(index: number, status: "paid" | "failed") {
    if (!sale) return;
    startTransition(async () => {
      await setInstallmentStatus(sale.id, index, status);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border p-5">
          <DrawerTitle className="text-lg font-medium">{sale.clientName}</DrawerTitle>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer">
              ×
            </Button>
          </DrawerClose>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="sticker-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Payé</p>
              <p className="mt-1 font-display text-xl font-medium">{summary.paidTotal} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-medium text-muted-foreground">En attente</p>
              <p className="mt-1 font-display text-xl font-medium">{summary.pendingTotal} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Impayé</p>
              <p className={cn("mt-1 font-display text-xl font-medium", summary.failedTotal > 0 && "text-state-critical")}>
                {summary.failedTotal} €
              </p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-medium text-muted-foreground">Prochaine échéance</p>
              <p className="mt-1 font-display text-xl font-medium">{summary.nextDue ?? "—"}</p>
            </div>
          </div>

          {sale.installments && sale.installments.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Échéances</p>
              <ul className="flex flex-col gap-2">
                {sale.installments.map((installment, index) => (
                  <li key={index} className="flex items-center justify-between rounded-[var(--radius-control)] border border-border p-3 text-sm">
                    <div>
                      <p className="font-medium">{installment.amount} €</p>
                      <p className="text-xs text-muted-foreground">
                        {installment.dueDate} — {STATUS_LABELS[installment.status]}
                      </p>
                    </div>
                    {installment.status !== "paid" && (
                      <div className="flex gap-1.5">
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
