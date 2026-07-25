"use client";

import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { formatEur } from "@/lib/currency";
import type { SetterCommissions } from "@/lib/setters/types";

export function SetterSalesDrawer({
  setterName,
  commissions,
  open,
  onOpenChange,
}: {
  setterName: string;
  commissions: SetterCommissions | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4">
            <DrawerTitle className="text-base font-bold">Ventes settées — {setterName}</DrawerTitle>
            <DrawerClose className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
              ✕
            </DrawerClose>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {!commissions || commissions.sales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune vente settée pour l&apos;instant.</p>
            ) : (
              <div className="sticker-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="p-3 text-left text-xs font-bold text-muted-foreground">Client</th>
                      <th className="p-3 text-left text-xs font-bold text-muted-foreground">Offre</th>
                      <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
                      <th className="p-3 text-right text-xs font-bold text-muted-foreground">Montant</th>
                      <th className="p-3 text-right text-xs font-bold text-muted-foreground">Commission</th>
                      <th className="p-3 text-left text-xs font-bold text-muted-foreground">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.sales.map((sale) => (
                      <tr key={sale.saleId} className="border-b border-border last:border-0">
                        <td className="p-3 font-bold">{sale.clientName}</td>
                        <td className="p-3 text-muted-foreground">{sale.offerName ?? "—"}</td>
                        <td className="p-3 text-muted-foreground">{sale.saleDate}</td>
                        <td className="p-3 text-right tabular-nums">{formatEur(sale.totalPrice)}</td>
                        <td className="p-3 text-right tabular-nums">
                          {formatEur(Math.round(sale.commissionAmount))} ({Math.round(sale.commissionPct * 100)}%)
                        </td>
                        <td className="p-3">
                          <span
                            className={
                              sale.paymentStatus === "payee"
                                ? "rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy"
                                : "rounded-full bg-state-caution-bg px-2 py-0.5 text-xs font-bold text-state-caution"
                            }
                          >
                            {sale.paymentStatus === "payee" ? "Payée" : "À venir"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
