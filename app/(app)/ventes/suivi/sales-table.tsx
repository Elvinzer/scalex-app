"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SourceBadge, type MetricSource } from "@/components/source-badge";
import type { Offer } from "@/lib/business/types";
import type { ActiveCloser } from "@/lib/closers/types";
import { displayInstallments, summarize } from "@/lib/sales/installments";
import type { OverallSaleStatus, SaleRow } from "@/lib/sales/types";
import type { SetterRow } from "@/lib/setters/types";
import type { StripeInsightTransaction } from "@/lib/stripe/transaction-insights";

import { removeSale } from "./actions";
import { SaleDetailDrawer } from "./sale-detail-drawer";
import { SaleFormDialog } from "./sale-form-dialog";

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

function statusLabel(sale: SaleRow, status: OverallSaleStatus, t: (key: string) => string): string {
  if (sale.isOrphan) return t("toAttach");
  if (status === "failed") return t("paymentFailed");
  if (status === "refunded") return t("refunded");
  if (status === "in_progress") return sale.paymentMethod === "virement" ? t("transferExpected") : t("upcomingPayment");
  return t("settled");
}

function sourceForSale(sale: SaleRow): MetricSource {
  if (sale.source === "stripe") return "Stripe";
  const channel = sale.sourceChannel?.toLocaleLowerCase("fr-FR") ?? "";
  if (channel.includes("calendly")) return "Calendly";
  if (channel.includes("iclosed")) return "iClosed";
  return "Saisie";
}

function closerName(closers: ActiveCloser[], closerId: string): string | null {
  return closers.find((closer) => closer.id === closerId)?.name ?? null;
}

function stripeStatusKey(transaction: StripeInsightTransaction): "succeeded" | "pending" | "failed" | "partially_refunded" | "refunded" {
  return transaction.status;
}

function stripePaymentTypeKey(transaction: StripeInsightTransaction): "subscription" | "one_shot" {
  return transaction.paymentType === "subscription" ? "subscription" : "one_shot";
}

function formatStripeMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100).toLocaleString(locale)} ${currency.toUpperCase()}`;
  }
}

export function SalesTable({
  sales,
  allSales,
  setters,
  closers,
  offers,
  stripeTransactions = [],
  stripeConnection,
}: {
  sales: SaleRow[];
  allSales: SaleRow[];
  setters: SetterRow[];
  closers: ActiveCloser[];
  offers: Offer[];
  stripeTransactions?: StripeInsightTransaction[];
  stripeConnection?: { accountId: string; livemode: boolean } | null;
}) {
  const locale = useLocale();
  const t = useTranslations("sales");
  const insightT = useTranslations("sales.insights");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const selected = selectedId ? (sales.find((sale) => sale.id === selectedId) ?? null) : null;
  const selectedTransaction = selectedTransactionId ? (stripeTransactions.find((transaction) => transaction.id === selectedTransactionId) ?? null) : null;
  const [setterFilter, setSetterFilter] = useState("");
  const [closerFilter, setCloserFilter] = useState("");
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
          (!closerFilter || sale.closer === closerName(closers, closerFilter)) &&
          (!paymentMethodFilter || sale.paymentMethod === paymentMethodFilter) &&
          (!paymentTypeFilter || sale.paymentType === paymentTypeFilter) &&
          (!statusFilter || matchesStatus)
        );
      }),
    [sales, setterFilter, closerFilter, paymentMethodFilter, paymentTypeFilter, statusFilter, closers]
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

  if (sales.length === 0 && stripeTransactions.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">{t("noSales")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("firstSale")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {setters.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-muted-foreground">{t("filterSetter")}</span>
            <select
              value={setterFilter}
              onChange={(event) => setSetterFilter(event.target.value)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">{t("all")}</option>
              {setters.map((setter) => (
                <option key={setter.id} value={setter.id}>
                  {setter.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {closers.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-muted-foreground">{t("filterCloser")}</span>
            <select
              value={closerFilter}
              onChange={(event) => setCloserFilter(event.target.value)}
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">{t("all")}</option>
              {closers.map((closer) => (
                <option key={closer.id} value={closer.id}>
                  {closer.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">
          <span className="text-xs font-bold text-muted-foreground">{t("paymentMethod")}</span>
          <select
            value={paymentMethodFilter}
            onChange={(event) => setPaymentMethodFilter(event.target.value)}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">{t("all")}</option>
            <option value="stripe">Stripe</option>
            <option value="virement">{t("transfer")}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">
          <span className="text-xs font-bold text-muted-foreground">{t("nature")}</span>
          <select
            value={paymentTypeFilter}
            onChange={(event) => setPaymentTypeFilter(event.target.value)}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">{t("allFeminine")}</option>
            <option value="one_shot">{t("paymentTypes.one_shot")}</option>
            <option value="installments">{t("paymentTypes.installments")}</option>
            <option value="subscription">{t("paymentTypes.subscription")}</option>
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm">
          <span className="text-xs font-bold text-muted-foreground">{t("status")}</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">{t("all")}</option>
            <option value="paid">{t("paid")}</option>
            <option value="upcoming">{t("upcoming")}</option>
            <option value="failed">{t("unpaid")}</option>
            <option value="refunded">{t("refunded")}</option>
            <option value="orphan">{t("toAttach")}</option>
          </select>
        </label>
      </div>

      {displayRows.length === 0 && stripeTransactions.length === 0 ? (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("noFilterMatch")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("resetFilter")}</p>
        </div>
      ) : (
        <>
          <div className="sticker-card hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("date")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("client")}</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("deal")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("nature")}</th>
                <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("collected")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("nextPayment")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("source")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("setter")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("closer")}</th>
                <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("status")}</th>
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
                  <td className="p-3 font-bold">{sale.isOrphan ? t("identify") : sale.clientName}</td>
                  <td className="p-3 text-right font-bold tabular-nums">{new Intl.NumberFormat(locale).format(sale.totalPrice)} €</td>
                  <td className="p-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {sale.paymentType === "installments" ? `${t("installmentSchedule")} · ${installmentCount} ${t("times")}` : t(`paymentTypes.${sale.paymentType}`)}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{new Intl.NumberFormat(locale).format(summary.paidTotal)} €</td>
                  <td className="p-3 text-muted-foreground">{nextInstallment ? `${nextInstallment.dueDate} · ${new Intl.NumberFormat(locale).format(nextInstallment.amount)} €` : "—"}</td>
                  <td className="p-3"><SourceBadge source={sourceForSale(sale)} /></td>
                  <td className="p-3 text-muted-foreground">{setterName(sale.setterId)}</td>
                  <td className="p-3 text-muted-foreground">{sale.closer ?? "—"}</td>
                  <td className="p-3">
                    <StatusBadge status={statusLabel(sale, summary.overallStatus, t)} />
                  </td>
                  <td className="p-3 text-right">
                    {sale.isOrphan ? (
                      <SaleFormDialog
                        offers={offers}
                        setters={setters}
                        closers={closers}
                        sale={sale}
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {t("createSale")}
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
                        {t("remove")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {stripeTransactions.map((transaction) => (
                <tr key={`stripe-${transaction.id}`} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(transaction.occurredAt))}</td>
                  <td className="p-3 font-bold">{transaction.customerName ?? insightT("stripeCustomerUnknown")}</td>
                  <td className="p-3 text-right font-bold tabular-nums">{formatStripeMoney(transaction.amountCents, transaction.currency, locale)}</td>
                  <td className="p-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{insightT(`paymentTypes.${stripePaymentTypeKey(transaction)}`)}</span></td>
                  <td className="p-3 text-right tabular-nums">{formatStripeMoney(Math.max(0, transaction.amountCents - transaction.amountRefundedCents), transaction.currency, locale)}</td>
                  <td className="p-3 text-muted-foreground">—</td>
                  <td className="p-3"><SourceBadge source="Stripe" /></td>
                  <td className="p-3 text-muted-foreground">—</td>
                  <td className="p-3 text-muted-foreground">—</td>
                  <td className="p-3"><StatusBadge status={insightT(`transactionStatuses.${stripeStatusKey(transaction)}`)} /></td>
                  <td className="p-3 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(transaction.id)} aria-label={insightT("viewTransaction", { id: transaction.id })}>{insightT("view")}</Button></td>
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
                    <p className="font-bold">{sale.isOrphan ? t("identify") : sale.clientName}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{sale.saleDate} · {sale.paymentMethod === "virement" ? t("transfer") : "Stripe"}</p>
                  </div>
                  <StatusBadge status={statusLabel(sale, summary.overallStatus, t)} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">{t("deal")}</p><p className="font-bold tabular-nums">{new Intl.NumberFormat(locale).format(sale.totalPrice)} €</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("collected")}</p><p className="font-bold tabular-nums">{new Intl.NumberFormat(locale).format(summary.paidTotal)} €</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("nature")}</p><p className="font-bold">{sale.paymentType === "installments" ? `${installmentCount} ${t("installments")}` : t(`paymentTypes.${sale.paymentType}`)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("nextPayment")}</p><p className="font-bold">{nextInstallment?.dueDate ?? "—"}</p></div>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <SourceBadge source={sourceForSale(sale)} />
                  {sale.isOrphan ? (
                    <SaleFormDialog
                      offers={offers}
                      setters={setters}
                      closers={closers}
                      sale={sale}
                      trigger={<Button type="button" variant="outline" size="sm" onClick={(event) => event.stopPropagation()}>{t("createSale")}</Button>}
                    />
                  ) : (
                    <Button type="button" variant="ghost" size="sm" onClick={(event) => { event.stopPropagation(); handleDelete(sale.id); }}>
                      {t("remove")}
                    </Button>
                  )}
                </div>
              </article>
            ))}
            {stripeTransactions.map((transaction) => (
              <article key={`stripe-mobile-${transaction.id}`} className="sticker-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{transaction.customerName ?? insightT("stripeCustomerUnknown")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(transaction.occurredAt))} · Stripe</p>
                  </div>
                  <StatusBadge status={insightT(`transactionStatuses.${stripeStatusKey(transaction)}`)} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">{t("deal")}</p><p className="font-bold tabular-nums">{formatStripeMoney(transaction.amountCents, transaction.currency, locale)}</p></div>
                  <div><p className="text-xs text-muted-foreground">{t("collected")}</p><p className="font-bold tabular-nums">{formatStripeMoney(Math.max(0, transaction.amountCents - transaction.amountRefundedCents), transaction.currency, locale)}</p></div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setSelectedTransactionId(transaction.id)}>{insightT("view")}</Button>
              </article>
            ))}
          </div>
        </>
      )}

      {selectedTransaction ? (
        <aside className="mt-4 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft p-4" aria-labelledby="stripe-transaction-detail-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p id="stripe-transaction-detail-title" className="text-sm font-bold">{insightT("transactionDetail")}</p>
              {selectedTransaction.customerName ? <p className="mt-1 text-xs text-muted-foreground">{selectedTransaction.customerName}</p> : null}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(null)}>{insightT("closeDetail")}</Button>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">{insightT("date")}</dt><dd className="font-bold">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedTransaction.occurredAt))}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{insightT("amount")}</dt><dd className="font-bold">{formatStripeMoney(selectedTransaction.amountCents, selectedTransaction.currency, locale)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{insightT("refunded")}</dt><dd className="font-bold">{formatStripeMoney(selectedTransaction.amountRefundedCents, selectedTransaction.currency, locale)}</dd></div>
          </dl>
        </aside>
      ) : null}

      <SaleDetailDrawer
        sale={selected}
        allSales={allSales}
        offers={offers}
        setters={setters}
        closers={closers}
        stripeConnection={stripeConnection}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </>
  );
}
