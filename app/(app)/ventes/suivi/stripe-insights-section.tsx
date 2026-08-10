"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Clock3, Filter, RefreshCw, Sparkles } from "lucide-react";

import { KpiTile } from "@/components/kpi-tile";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type StripeInsightSignal,
  type StripeInsightSnapshot,
  type StripeInsightTransaction,
  type StripeTrendPoint,
} from "@/lib/stripe/transaction-insights";

import {
  generateStripeTransactionInsight,
  requestStripeInsightsRefresh,
} from "./insight-actions";
import { StripeTrendChart } from "./stripe-trend-chart";

type SyncState = {
  initialSyncStatus: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
};

type StatusFilter = "all" | "succeeded" | "pending" | "failed" | "refunded";
type PaymentTypeFilter = "all" | "one_shot" | "subscription" | "unknown";

const STATUS_FILTER_OPTIONS: StatusFilter[] = ["all", "succeeded", "pending", "failed", "refunded"];
const PAYMENT_TYPE_FILTER_OPTIONS: PaymentTypeFilter[] = ["all", "one_shot", "subscription", "unknown"];

function parseStatusFilter(value: string): StatusFilter {
  for (const option of STATUS_FILTER_OPTIONS) if (option === value) return option;
  return "all";
}

function parsePaymentTypeFilter(value: string): PaymentTypeFilter {
  for (const option of PAYMENT_TYPE_FILTER_OPTIONS) if (option === value) return option;
  return "all";
}

function formatMoney(cents: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100).toLocaleString(locale)} ${currency.toUpperCase()}`;
  }
}

function formatDate(value: string | Date, locale: string, unknownDate: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return unknownDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function formatPercent(value: number | null, locale: string): string {
  return value === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value))} %`;
}

function comparisonDelta(value: StripeInsightSnapshot["comparison"]["netCents"], inverse = false) {
  if (value.previous === null) return undefined;
  if (value.deltaPercent === null) {
    return { labelKey: value.current === 0 ? "stable" as const : "new" as const, direction: value.current === 0 ? "stable" as const : "up" as const, tone: inverse ? "negative" as const : "positive" as const };
  }
  const isUp = value.deltaPercent > 0;
  return {
    labelValue: `${isUp ? "+" : ""}${Math.round(value.deltaPercent)} %`,
    direction: isUp ? "up" as const : value.deltaPercent < 0 ? "down" as const : "stable" as const,
    tone: inverse ? (isUp ? "negative" as const : "positive" as const) : (isUp ? "positive" as const : "negative" as const),
  };
}

function statusForTransaction(transaction: StripeInsightTransaction): StatusFilter {
  if (transaction.status === "partially_refunded" || transaction.status === "refunded") return "refunded";
  return transaction.status;
}

function transactionStatusKey(transaction: StripeInsightTransaction): "succeeded" | "pending" | "failed" | "partially_refunded" | "refunded" {
  switch (transaction.status) {
    case "succeeded":
      return "succeeded";
    case "pending":
      return "pending";
    case "failed":
      return "failed";
    case "partially_refunded":
      return "partially_refunded";
    case "refunded":
      return "refunded";
  }
}

function paymentTypeKey(paymentType: StripeInsightTransaction["paymentType"]): "subscription" | "one_shot" | "unknown" {
  if (paymentType === "subscription") return "subscription";
  if (paymentType === "one_shot") return "one_shot";
  return "unknown";
}

function priorityKey(priority: StripeInsightSignal["priority"]): "highPriority" | "mediumPriority" | "watch" {
  if (priority === "high") return "highPriority";
  if (priority === "medium") return "mediumPriority";
  return "watch";
}

function priorityClass(priority: StripeInsightSignal["priority"]): string {
  if (priority === "high") return "bg-state-critical-bg text-state-critical";
  if (priority === "medium") return "bg-state-caution-bg text-state-caution";
  return "bg-accent-2-soft text-accent-2-text";
}

function syncMessage(connection: SyncState, locale: string, unknownDate: string): { messageKey?: "syncPending" | "dataCurrent" | "syncNotDone"; date?: string; label?: string; tone: "healthy" | "caution" | "critical" } {
  if (connection.lastSyncError) return { label: connection.lastSyncError, tone: "critical" };
  if (connection.initialSyncStatus === "pending") return { messageKey: "syncPending", tone: "caution" };
  if (connection.lastSyncCompletedAt) return { messageKey: "dataCurrent", date: formatDate(connection.lastSyncCompletedAt, locale, unknownDate), tone: "healthy" };
  return { messageKey: "syncNotDone", tone: "caution" };
}

function syncToneClass(tone: "healthy" | "caution" | "critical"): string {
  if (tone === "healthy") return "text-state-healthy";
  if (tone === "critical") return "text-state-critical";
  return "text-state-caution";
}

export function StripeInsightsSection({
  connected,
  connection,
  periodKey,
  availableCurrencies,
  activeCurrency,
  snapshot,
  signals,
  trend,
  visibleTransactions,
  initialInsightText,
}: {
  connected: boolean;
  connection: SyncState | null;
  periodKey: string;
  availableCurrencies: string[];
  activeCurrency: string | null;
  snapshot: StripeInsightSnapshot | null;
  signals: StripeInsightSignal[];
  trend: StripeTrendPoint[];
  visibleTransactions: StripeInsightTransaction[];
  initialInsightText: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations("sales.insights");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [insightText, setInsightText] = useState(initialInsightText);
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentTypeFilter>("all");
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const sync = connection ? syncMessage(connection, locale, t("unknownDate")) : null;
  const delta = (value: StripeInsightSnapshot["comparison"]["netCents"], inverse = false) => {
    const result = comparisonDelta(value, inverse);
    if (!result) return undefined;
    return {
      ...result,
      label: "labelKey" in result && result.labelKey ? t(result.labelKey) : t("vsPrevious", { value: result.labelValue ?? "" }),
    };
  };
  const filteredTransactions = useMemo(
    () =>
      visibleTransactions.filter((transaction) => {
        const statusMatches = statusFilter === "all" || statusForTransaction(transaction) === statusFilter;
        const typeMatches = paymentTypeFilter === "all" || transaction.paymentType === paymentTypeFilter;
        return statusMatches && typeMatches;
      }),
    [paymentTypeFilter, statusFilter, visibleTransactions],
  );
  const selectedTransaction = visibleTransactions.find((transaction) => transaction.id === selectedTransactionId) ?? null;

  function selectCurrency(currency: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("currency", currency);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function refresh() {
    setFeedback(null);
    startTransition(async () => {
      const result = await requestStripeInsightsRefresh();
      if (result.error) {
        setFeedback(result.error);
        setFeedbackIsError(true);
        return;
      }
      setFeedback(t("syncRequest"));
      setFeedbackIsError(false);
      router.refresh();
    });
  }

  function generate(signal: StripeInsightSignal) {
    if (!activeCurrency) return;
    setActiveSignal(signal.type);
    setFeedback(null);
    startTransition(async () => {
      const result = await generateStripeTransactionInsight({
        period: periodKey,
        currency: activeCurrency,
        signalType: signal.type,
      });
      setActiveSignal(null);
      if (result.error) {
        setFeedback(result.error);
        setFeedbackIsError(true);
        return;
      }
      setInsightText(result.insightText);
      setFeedback(t("agentWording"));
      setFeedbackIsError(false);
      router.refresh();
    });
  }

  if (!connected) {
    return (
      <section id="stripe-insights" className="sticker-card p-5 sm:p-6" aria-labelledby="stripe-insights-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2-text uppercase">{t("analysis")}</p>
            <h2 id="stripe-insights-title" className="mt-1 text-xl font-bold">{t("understandPayments")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("connectHelp")}
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/integrations#stripe">{t("connectStripe")}</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section id="stripe-insights" className="flex min-w-0 flex-col gap-4" aria-labelledby="stripe-insights-title">
      <div className="sticker-card min-w-0 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2-text uppercase">{t("analysis")}</p>
            <h2 id="stripe-insights-title" className="mt-1 text-xl font-bold">{t("transactionsExplain")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("snapshotHelp")}
            </p>
          </div>

          <div id="stripe-insights-toolbar" className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={t("controls")}>
            <label htmlFor="stripe-currency" className="sr-only">{t("currency")}</label>
            <select
              id="stripe-currency"
              value={activeCurrency ?? ""}
              onChange={(event) => selectCurrency(event.target.value)}
              disabled={availableCurrencies.length === 0 || isPending}
              className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              {availableCurrencies.length === 0 ? <option value="">{t("currency")} —</option> : null}
              {availableCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency.toUpperCase()}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isPending} className="min-h-9">
              <RefreshCw className={cn("size-4", isPending && "motion-safe:animate-spin")} aria-hidden="true" />
              {t("refresh")}
            </Button>
          </div>
        </div>

        {sync ? (
          <p className={cn("mt-4 flex items-start gap-2 text-sm font-bold", syncToneClass(sync.tone))} aria-live="polite">
            {sync.tone === "healthy" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : sync.tone === "critical" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{sync.label ?? (sync.messageKey ? t(sync.messageKey, sync.date ? { date: sync.date } : undefined) : null)}</span>
          </p>
        ) : null}
        {feedback ? <p className={cn("mt-2 text-sm font-bold", feedbackIsError ? "text-state-critical" : "text-muted-foreground")} role={feedbackIsError ? "alert" : "status"} aria-live="polite">{feedback}</p> : null}
      </div>

      {!snapshot || !activeCurrency ? (
        <div className="sticker-card p-6 text-center">
          <p className="text-base font-bold">{t("noTransactions")}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            {t("syncInstruction")}
          </p>
          <Button type="button" variant="outline" onClick={refresh} disabled={isPending} className="mt-4 min-h-9">
            <RefreshCw className={cn("size-4", isPending && "motion-safe:animate-spin")} aria-hidden="true" />
            {t("requestSync")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label={t("analysis")}>
            <KpiTile label={t("netRevenue")} value={formatMoney(snapshot.netCents, activeCurrency, locale)} delta={delta(snapshot.comparison.netCents)} tone="positive" />
            <KpiTile label={t("grossRevenue")} value={formatMoney(snapshot.grossCents, activeCurrency, locale)} delta={delta(snapshot.comparison.grossCents)} />
            <KpiTile label={t("refunds")} value={formatMoney(snapshot.refundsCents, activeCurrency, locale)} detail={t("rate", { value: formatPercent(snapshot.refundRatePct, locale) })} tone={snapshot.refundsCents > 0 ? "warning" : "default"} />
            <KpiTile label={t("riskAmount")} value={formatMoney(snapshot.amountAtRiskCents, activeCurrency, locale)} detail={t("failureCount", { count: snapshot.failedTransactions, plural: snapshot.failedTransactions > 1 ? "s" : "", rate: formatPercent(snapshot.failureRatePct, locale) })} tone={snapshot.amountAtRiskCents > 0 ? "negative" : "default"} />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <article id="stripe-trend" className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-trend-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="stripe-trend-title" className="text-base font-bold">{t("netTrend")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("refundTiming")}</p>
                </div>
                <p className="text-right text-sm font-bold text-muted-foreground">{t("averageTicket")}<br /><span className="text-foreground">{snapshot.averageTicketCents === null ? "—" : formatMoney(snapshot.averageTicketCents, activeCurrency, locale)}</span></p>
              </div>
              <div className="mt-5 min-w-0" role="img" aria-label={`${t("netTrend")} — ${activeCurrency.toUpperCase()}`} aria-describedby="stripe-trend-summary">
                <StripeTrendChart data={trend} currency={activeCurrency} />
              </div>
            </article>

            <article className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-mix-title">
              <h3 id="stripe-mix-title" className="text-base font-bold">{t("mixRetention")}</h3>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <div><dt className="text-xs font-bold text-muted-foreground">{t("successfulTransactions")}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.successfulTransactions}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">{t("failures")}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-state-critical">{snapshot.failedTransactions}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">{t("recurringShare")}</dt><dd className="mt-1 text-xl font-bold tabular-nums text-accent-2-text">{formatPercent(snapshot.recurringSharePct, locale)}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">{t("repeatCustomers")}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.repeatCustomers === null ? "—" : snapshot.repeatCustomers}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">{t("knownCustomers")}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.uniqueCustomers === null ? "—" : snapshot.uniqueCustomers}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">{t("maxConcentration")}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatPercent(snapshot.topCustomerSharePct, locale)}</dd></div>
              </dl>
              <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                {snapshot.customersWithoutId > 0 ? t("customersWithoutId", { count: snapshot.customersWithoutId, plural: snapshot.customersWithoutId > 1 ? "s" : "" }) : t("allCustomersKnown")}
              </p>
            </article>
          </div>

          <section className="min-w-0" aria-labelledby="stripe-signals-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="stripe-signals-title" className="text-lg font-bold">{t("signalsTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("signalsHelp")}</p>
              </div>
              <p className="text-xs font-bold text-muted-foreground">{t("signalCount", { count: signals.length, plural: signals.length > 1 ? "x" : "", sample: snapshot.successfulTransactions + snapshot.failedTransactions })}</p>
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {signals.map((signal) => (
                <article key={signal.type} className="sticker-card min-w-0 p-5" aria-labelledby={`stripe-signal-${signal.type}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn("mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-bold", priorityClass(signal.priority))}>{t(priorityKey(signal.priority))}</span>
                      <h4 id={`stripe-signal-${signal.type}`} className="min-w-0 text-base font-bold">{signal.title}</h4>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9 border-accent-2-border text-accent-2-text hover:border-accent-2-border hover:bg-accent-2-soft"
                      onClick={() => generate(signal)}
                      disabled={isPending || activeSignal !== null || signal.type === "insufficient_data"}
                      aria-label={t("makeAction", { title: signal.title })}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      {activeSignal === signal.type ? t("formulating") : t("formulate")}
                    </Button>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{signal.summary}</p>
                  <ul className="mt-3 space-y-1.5 text-sm font-bold">
                    {signal.evidence.map((evidence) => <li key={evidence} className="flex gap-2"><span className="text-accent-2-text" aria-hidden="true">•</span><span>{evidence}</span></li>)}
                  </ul>
                  <p className="mt-4 border-t border-border pt-3 text-sm font-bold text-accent-2-text">{t("nextAction", { action: signal.action })}</p>
                </article>
              ))}
            </div>
          </section>

          {insightText ? (
            <article className="rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft p-5" aria-labelledby="stripe-ai-insight-title" aria-live="polite">
              <div className="flex items-center gap-2 text-accent-2-text"><Sparkles className="size-4" aria-hidden="true" /><h3 id="stripe-ai-insight-title" className="text-sm font-bold">{t("agentWording")}</h3></div>
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-foreground">{insightText}</p>
            </article>
          ) : null}

          <section id="stripe-transactions" className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-transactions-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 id="stripe-transactions-title" className="text-lg font-bold">{t("transactionsTitle")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t("transactionsHelp")}</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label={t("transactionFilters")}>
                <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="stripe-status-filter" className="sr-only">{t("statusFilter")}</label>
                <select id="stripe-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(parseStatusFilter(event.target.value))} className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
                  {STATUS_FILTER_OPTIONS.map((value) => <option key={value} value={value}>{t(`statusLabels.${value}`)}</option>)}
                </select>
                <label htmlFor="stripe-type-filter" className="sr-only">{t("typeFilter")}</label>
                <select id="stripe-type-filter" value={paymentTypeFilter} onChange={(event) => setPaymentTypeFilter(parsePaymentTypeFilter(event.target.value))} className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
                  {PAYMENT_TYPE_FILTER_OPTIONS.map((value) => <option key={value} value={value}>{t(`paymentTypeLabels.${value}`)}</option>)}
                </select>
              </div>
            </div>

            {selectedTransaction ? (
              <aside className="mt-4 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft p-4" aria-labelledby="stripe-transaction-detail-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p id="stripe-transaction-detail-title" className="text-sm font-bold">{t("transactionDetail")}</p><p className="mt-1 break-all text-xs text-muted-foreground">{t("charge")} {selectedTransaction.id}</p></div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(null)}>{t("closeDetail")}</Button>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">{t("date")}</dt><dd className="font-bold">{formatDate(selectedTransaction.occurredAt, locale, t("unknownDate"))}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("amount")}</dt><dd className="font-bold">{formatMoney(selectedTransaction.amountCents, activeCurrency, locale)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("refunded")}</dt><dd className="font-bold">{formatMoney(selectedTransaction.amountRefundedCents, activeCurrency, locale)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">{t("stripeCustomer")}</dt><dd className="break-all font-bold">{selectedTransaction.customerId ?? t("notProvided")}</dd></div>
                </dl>
              </aside>
            ) : null}

            <div className="mt-5 max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <caption className="sr-only">{t("caption")}</caption>
                <thead className="bg-surface-sunken text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-bold">{t("charge")}</th>
                    <th scope="col" className="px-3 py-3 font-bold">{t("date")}</th>
                    <th scope="col" className="px-3 py-3 font-bold">{t("amount")}</th>
                    <th scope="col" className="px-3 py-3 font-bold">{t("type")}</th>
                    <th scope="col" className="px-3 py-3 font-bold">{t("status")}</th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">{t("detail")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="transition-colors hover:bg-muted/40">
                      <th scope="row" className="max-w-[170px] truncate px-3 py-3 font-mono text-xs font-bold" title={transaction.id}>{transaction.id.slice(-12)}</th>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(transaction.occurredAt, locale, t("unknownDate"))}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">
                        {formatMoney(transaction.amountCents, activeCurrency, locale)}
                        {transaction.amountRefundedCents > 0 ? <span className="block text-xs font-normal text-state-caution">− {formatMoney(transaction.amountRefundedCents, activeCurrency, locale)} {t("refundedSuffix")}</span> : null}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{t(`paymentTypes.${paymentTypeKey(transaction.paymentType)}`)}</td>
                      <td className="px-3 py-3"><StatusBadge status={t(`transactionStatuses.${transactionStatusKey(transaction)}`)} /></td>
                      <td className="px-3 py-3 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(transaction.id)} aria-label={t("viewTransaction", { id: transaction.id })}>{t("view")}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransactions.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("noFilterMatch")}</p> : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
