"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { Offer } from "@/lib/business/types";
import type { ActiveCloser } from "@/lib/closers/types";
import { displayInstallments, summarize } from "@/lib/sales/installments";
import type { SaleRow } from "@/lib/sales/types";
import { stripeDashboardChargeUrl } from "@/lib/stripe/dashboard-url";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { acknowledgeFailedInstallment, setInstallmentStatus } from "./actions";
import { SaleFormDialog } from "./sale-form-dialog";

export function SaleDetailDrawer({
  sale,
  allSales,
  offers,
  setters,
  closers,
  stripeConnection,
  open,
  onOpenChange,
}: {
  sale: SaleRow | null;
  allSales: SaleRow[];
  offers: Offer[];
  setters: SetterRow[];
  closers: ActiveCloser[];
  stripeConnection?: { accountId: string; livemode: boolean } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("sales.detailView");
  const numberFormat = new Intl.NumberFormat(locale);
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
            {!sale.parentSaleId && <SaleFormDialog offers={offers} setters={setters} closers={closers} sale={sale} trigger={<Button type="button" variant="outline" size="sm">{t("edit")}</Button>} />}
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("close")}>
                ×
              </Button>
            </DrawerClose>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {offerName && <span>{offerName}</span>}
            {sale.paymentNumber !== null && sale.paymentCount !== null && <span>{t("paymentOf", { number: sale.paymentNumber, count: sale.paymentCount })}</span>}
            {sale.sourceChannel && <span>{t("source", { value: sale.sourceChannel })}</span>}
            {setterName && <span>{t("setter", { value: setterName })}</span>}
            {sale.closer && <span>{t("closer", { value: sale.closer })}</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">{t("paid")}</p>
              <p className="mt-1 font-display text-xl font-bold">{numberFormat.format(summary.paidTotal)} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">{t("pending")}</p>
              <p className="mt-1 font-display text-xl font-bold">{numberFormat.format(summary.pendingTotal)} €</p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">{t("failed")}</p>
              <p className={cn("mt-1 font-display text-xl font-bold", summary.failedTotal > 0 && "text-state-critical")}>
                {numberFormat.format(summary.failedTotal)} €
              </p>
            </div>
            <div className="sticker-card p-4">
              <p className="text-xs font-bold text-muted-foreground">{t("remaining")}</p>
              <p className="mt-1 font-display text-xl font-bold">
                {hasFiniteSchedule ? `${numberFormat.format(aggregatedRemaining)} €` : "—"}
              </p>
            </div>
          </div>

          {summary.nextDue && <p className="text-sm text-muted-foreground">{t("nextDue", { date: summary.nextDue })}</p>}

          {sale.isOrphan && (
            <div className="rounded-[var(--radius-control)] bg-warning-soft p-4">
              <p className="text-sm font-bold text-warning-text">{t("attachNotice")}</p>
              <p className="mt-1 text-sm text-warning-text">{t("attachHint")}</p>
              <div className="mt-3">
                <SaleFormDialog
                  offers={offers}
                  setters={setters}
                  closers={closers}
                  sale={sale}
                  trigger={<Button type="button" variant="outline" size="sm">{t("createSale")}</Button>}
                />
              </div>
            </div>
          )}

          {displayInstallments(sale.totalPrice, sale.saleDate, sale.installments).length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold">{t("installments")}</p>
              <ul className="flex flex-col gap-2">
                {displayInstallments(sale.totalPrice, sale.saleDate, sale.installments).map(({ installment, index, synthetic }) => (
                  <li key={index} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        {!synthetic && sale.paymentType === "installments" && <p className="text-xs font-bold text-accent-2-text">{t("paymentOf", { number: index + 1, count: sale.installments?.length ?? 0 })}</p>}
                        <p className="font-bold">{numberFormat.format(installment.amount)} €</p>
                        <p className="text-xs text-muted-foreground">
                          {installment.dueDate} — {t(`statuses.${installment.status}`)}
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
                            {t("markPaid")}
                          </Button>
                          {installment.status !== "failed" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isPending}
                              onClick={() => toggleStatus(index, "failed")}
                            >
                              {t("markFailed")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {installment.status === "failed" && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-state-critical/10 px-3 py-2">
                        <p className="text-xs font-bold text-state-critical">
                          {installment.failureReason ?? t("paymentDeclined")}
                        </p>
                        <div className="flex items-center gap-1.5">
                          {installment.stripeChargeId && stripeConnection && (
                            <Button asChild variant="link" size="sm">
                              <a
                                href={stripeDashboardChargeUrl(stripeConnection.accountId, installment.stripeChargeId, stripeConnection.livemode)}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {t("viewStripe")}
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
                            {installment.acknowledgedAt ? t("processed") : t("markProcessed")}
                          </Button>
                        </div>
                      </div>
                    )}
                    {installment.status === "refunded" && (
                      <div className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-xs font-bold text-muted-foreground">
                        {t("refundNotice")}
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
