"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";

import { KpiTile } from "@/components/kpi-tile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type StripeInsightSnapshot,
  type StripeTrendPoint,
} from "@/lib/stripe/transaction-insights";

import {
  getStripeSyncStatus,
  requestStripeInsightsRefresh,
} from "./insight-actions";
import { StripeTrendChart } from "./stripe-trend-chart";

type SyncState = {
  initialSyncStatus: string;
  lastSyncStartedAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncError: string | null;
};

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
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  availableCurrencies,
  activeCurrency,
  snapshot,
  trend,
}: {
  connected: boolean;
  connection: SyncState | null;
  availableCurrencies: string[];
  activeCurrency: string | null;
  snapshot: StripeInsightSnapshot | null;
  trend: StripeTrendPoint[];
}) {
  const locale = useLocale();
  const t = useTranslations("sales.insights");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [syncRequested, setSyncRequested] = useState(false);

  const isSyncing = connection?.initialSyncStatus === "pending";
  const shouldPollSync = syncRequested || isSyncing;

  useEffect(() => {
    if (!shouldPollSync) return;

    let stopped = false;
    const checkSyncStatus = async () => {
      let result: Awaited<ReturnType<typeof getStripeSyncStatus>>;
      try {
        result = await getStripeSyncStatus();
      } catch {
        // A transient network failure must not crash the page. The next
        // polling cycle will retry the status check.
        return;
      }
      if (stopped || result.error) return;

      if (result.status === "completed" || result.status === "failed") {
        setSyncRequested(false);
        router.refresh();
      }
    };

    const intervalId = window.setInterval(() => {
      void checkSyncStatus();
    }, 2000);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [router, shouldPollSync]);

  const sync = connection ? syncMessage(connection, locale, t("unknownDate")) : null;
  const delta = (value: StripeInsightSnapshot["comparison"]["netCents"], inverse = false) => {
    const result = comparisonDelta(value, inverse);
    if (!result) return undefined;
    return {
      ...result,
      label: "labelKey" in result && result.labelKey ? t(result.labelKey) : t("vsPrevious", { value: result.labelValue ?? "" }),
    };
  };
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
      setSyncRequested(true);
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
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isPending || isSyncing} className="min-h-9">
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
          <Button type="button" variant="outline" onClick={refresh} disabled={isPending || isSyncing} className="mt-4 min-h-9">
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

        </>
      )}
    </section>
  );
}
