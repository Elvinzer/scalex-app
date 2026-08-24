"use client";

import { ChevronDown, ChevronUp, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acknowledgeFailedInstallment } from "@/app/(app)/ventes/suivi/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StripeInsightSignal } from "@/lib/stripe/transaction-insights";

export type FailedPaymentItem = {
  id: string;
  saleId: string;
  installmentIndex: number;
  client: string;
  amount: number;
  reason: string;
  dueDate: string;
  attempts: number;
};

export function FailedPaymentsPanel({
  items,
  signal,
  className,
}: {
  items: FailedPaymentItem[];
  signal?: StripeInsightSignal | null;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("sales");
  const insightT = useTranslations("sales.insights");
  const detailT = useTranslations("sales.detailView");
  const router = useRouter();
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const [processed, setProcessed] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPending, startTransition] = useTransition();
  const visibleItems = items.filter((item) => !processed.has(item.id));
  const failureSignal = signal?.type === "failures" ? signal : null;
  const hasLedgerItems = visibleItems.length > 0;
  if (!hasLedgerItems && !failureSignal) return null;

  const retry = (id: string) => setRetried((current) => new Set(current).add(id));
  const allRetried = visibleItems.every((item) => retried.has(item.id));
  const heading = failureSignal?.title ?? t("failedPaymentsTitle", { count: visibleItems.length, plural: visibleItems.length > 1 ? "s" : "" });
  const help = failureSignal ? t("failedPaymentsStripeHelp") : t("failedPaymentsHelp");
  const reviewHref = hasLedgerItems ? "#sales-ledger" : "#stripe-transactions";
  const reviewLabel = hasLedgerItems ? t("reviewSalesLedger") : t("reviewStripeTransactions");

  function markProcessed(item: FailedPaymentItem) {
    setFeedback(null);
    setProcessingId(item.id);
    startTransition(async () => {
      try {
        const result = await acknowledgeFailedInstallment(item.saleId, item.installmentIndex);
        if (result.error) {
          setFeedback(t("failedPaymentProcessError"));
          return;
        }
        setProcessed((current) => new Set(current).add(item.id));
        router.refresh();
      } catch {
        setFeedback(t("failedPaymentProcessError"));
      } finally {
        setProcessingId(null);
      }
    });
  }

  return (
    <section id="failed-payments" data-testid="failed-payments-warning" className={cn("scroll-mt-6 overflow-hidden rounded-[var(--radius-card)] border border-state-caution/40 bg-state-caution-bg", className)} aria-labelledby="failed-payments-title" aria-describedby={isMinimized ? undefined : "failed-payments-help"} role="alert">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-state-caution/30 px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-state-caution" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-state-caution-bg px-2.5 py-1 text-[11px] font-bold text-state-caution ring-1 ring-inset ring-state-caution/30">{t("failedPaymentsWarningLabel")}</span>
              <h2 id="failed-payments-title" className="text-base font-bold">{heading}</h2>
            </div>
            <p className="mt-2 text-sm font-bold text-state-caution">
              {failureSignal
                ? failureSignal.summary
                : `${new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(visibleItems.reduce((sum, item) => sum + item.amount, 0))} ${t("failedPaymentsSubtitle")}`}
            </p>
            {failureSignal ? (
              <ul className="mt-3 space-y-1 text-sm font-bold">
                {failureSignal.evidence.map((evidence) => <li key={evidence} className="flex gap-2"><span className="text-state-caution" aria-hidden="true">•</span><span>{evidence}</span></li>)}
              </ul>
            ) : null}
            <p id="failed-payments-help" className="mt-2 max-w-2xl text-sm text-foreground">{help}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized((value) => !value)}
            aria-expanded={!isMinimized}
            aria-controls="failed-payments-content"
            className="min-h-11"
          >
            {isMinimized ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronUp className="size-4" aria-hidden="true" />}
            {isMinimized ? t("expandWarning") : t("minimizeWarning")}
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href={reviewHref}>{reviewLabel}</Link>
          </Button>
        </div>
      </div>
      {isMinimized ? null : <div id="failed-payments-content">
      {failureSignal ? (
        <p className="border-b border-state-caution/20 px-5 py-3 text-sm font-bold text-state-caution sm:px-6">
          <Link href={reviewHref} className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
            {insightT("nextAction", { action: failureSignal.action })}
          </Link>
        </p>
      ) : null}
      {hasLedgerItems ? (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3 border-b border-state-caution/20 bg-card/70 px-5 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={() => visibleItems.forEach((item) => retry(item.id))} disabled={allRetried || isPending} className="min-h-11">
              <RotateCcw className="size-4" />
              {allRetried ? t("followUpsSent") : t("followUpAll")}
            </Button>
          </div>
          <div className="divide-y divide-border/70 bg-card">
            {visibleItems.map((item) => {
              const sent = retried.has(item.id);
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{item.client} · {new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(item.amount)} {t("due")}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.reason} · {t("dueDate", { date: item.dueDate })} · {item.attempts} {t("attempts", { plural: item.attempts > 1 ? "s" : "" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant={sent ? "ghost" : "outline"} size="sm" onClick={() => retry(item.id)} disabled={sent || isPending} className={cn("min-h-11", sent && "text-state-healthy")}>
                      {sent ? t("followUpSent") : t("followUp")}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => markProcessed(item)} disabled={isPending} className="min-h-11">
                      {processingId === item.id ? detailT("processing") : detailT("markProcessed")}
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="min-h-11">
                      <Link href="#sales-ledger">{t("detail")}</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {feedback ? <p className="border-t border-state-caution/30 px-5 py-3 text-sm font-bold text-state-critical" role="alert">{feedback}</p> : null}
      </div>}
    </section>
  );
}
