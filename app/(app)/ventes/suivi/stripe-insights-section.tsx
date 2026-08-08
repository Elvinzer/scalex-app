"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "Tous les statuts",
  succeeded: "Réussis",
  pending: "En attente",
  failed: "Échoués",
  refunded: "Remboursés",
};

const PAYMENT_TYPE_LABELS: Record<PaymentTypeFilter, string> = {
  all: "Tous les paiements",
  one_shot: "Ponctuels",
  subscription: "Récurrents",
  unknown: "À classer",
};

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

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100).toLocaleString("fr-FR")} ${currency.toUpperCase()}`;
  }
}

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} %`;
}

function comparisonDelta(value: StripeInsightSnapshot["comparison"]["netCents"], inverse = false) {
  if (value.previous === null) return undefined;
  if (value.deltaPercent === null) {
    return { label: value.current === 0 ? "Stable" : "Nouveau", direction: value.current === 0 ? "stable" as const : "up" as const, tone: inverse ? "negative" as const : "positive" as const };
  }
  const isUp = value.deltaPercent > 0;
  return {
    label: `${isUp ? "+" : ""}${Math.round(value.deltaPercent)} % vs période précédente`,
    direction: isUp ? "up" as const : value.deltaPercent < 0 ? "down" as const : "stable" as const,
    tone: inverse ? (isUp ? "negative" as const : "positive" as const) : (isUp ? "positive" as const : "negative" as const),
  };
}

function statusForTransaction(transaction: StripeInsightTransaction): StatusFilter {
  if (transaction.status === "partially_refunded" || transaction.status === "refunded") return "refunded";
  return transaction.status;
}

function transactionStatusLabel(transaction: StripeInsightTransaction): string {
  switch (transaction.status) {
    case "succeeded":
      return "Payé";
    case "pending":
      return "En attente";
    case "failed":
      return "Paiement échoué";
    case "partially_refunded":
      return "Partiellement remboursé";
    case "refunded":
      return "Remboursé";
  }
}

function paymentTypeLabel(paymentType: StripeInsightTransaction["paymentType"]): string {
  if (paymentType === "subscription") return "Récurrent";
  if (paymentType === "one_shot") return "Ponctuel";
  return "À classer";
}

function priorityLabel(priority: StripeInsightSignal["priority"]): string {
  if (priority === "high") return "Priorité haute";
  if (priority === "medium") return "Priorité moyenne";
  return "À surveiller";
}

function priorityClass(priority: StripeInsightSignal["priority"]): string {
  if (priority === "high") return "bg-state-critical-bg text-state-critical";
  if (priority === "medium") return "bg-state-caution-bg text-state-caution";
  return "bg-accent-2-soft text-accent-2-text";
}

function syncMessage(connection: SyncState): { label: string; tone: "healthy" | "caution" | "critical" } {
  if (connection.lastSyncError) return { label: connection.lastSyncError, tone: "critical" };
  if (connection.initialSyncStatus === "pending") return { label: "Synchronisation Stripe en cours…", tone: "caution" };
  if (connection.lastSyncCompletedAt) return { label: `Données à jour au ${formatDate(connection.lastSyncCompletedAt)}.`, tone: "healthy" };
  return { label: "Synchronisation Stripe pas encore terminée.", tone: "caution" };
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

  const sync = connection ? syncMessage(connection) : null;
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
      setFeedback("Synchronisation demandée. Les données se mettront à jour dès que Stripe aura répondu.");
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
      setFeedback("Insight généré à partir du snapshot Stripe validé.");
      setFeedbackIsError(false);
      router.refresh();
    });
  }

  if (!connected) {
    return (
      <section id="stripe-insights" className="sticker-card p-5 sm:p-6" aria-labelledby="stripe-insights-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2-text uppercase">Analyse Stripe</p>
            <h2 id="stripe-insights-title" className="mt-1 text-xl font-bold">Comprendre tes paiements</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Connecte le compte Stripe de ton activité pour calculer le CA net, les remboursements, les échecs et les signaux de fidélité.
            </p>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/integrations#stripe">Connecter Stripe</Link>
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
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2-text uppercase">Analyse Stripe</p>
            <h2 id="stripe-insights-title" className="mt-1 text-xl font-bold">Les transactions expliquent le goulot</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Un snapshot déterministe de tes paiements, sans conversion entre devises : les chiffres restent auditables transaction par transaction.
            </p>
          </div>

          <div id="stripe-insights-toolbar" className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Contrôles de l'analyse Stripe">
            <label htmlFor="stripe-currency" className="sr-only">Devise</label>
            <select
              id="stripe-currency"
              value={activeCurrency ?? ""}
              onChange={(event) => selectCurrency(event.target.value)}
              disabled={availableCurrencies.length === 0 || isPending}
              className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              {availableCurrencies.length === 0 ? <option value="">Devise —</option> : null}
              {availableCurrencies.map((currency) => (
                <option key={currency} value={currency}>{currency.toUpperCase()}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={isPending} className="min-h-9">
              <RefreshCw className={cn("size-4", isPending && "motion-safe:animate-spin")} aria-hidden="true" />
              Rafraîchir
            </Button>
          </div>
        </div>

        {sync ? (
          <p className={cn("mt-4 flex items-start gap-2 text-sm font-bold", syncToneClass(sync.tone))} aria-live="polite">
            {sync.tone === "healthy" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : sync.tone === "critical" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <Clock3 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
            <span>{sync.label}</span>
          </p>
        ) : null}
        {feedback ? <p className={cn("mt-2 text-sm font-bold", feedbackIsError ? "text-state-critical" : "text-muted-foreground")} role={feedbackIsError ? "alert" : "status"} aria-live="polite">{feedback}</p> : null}
      </div>

      {!snapshot || !activeCurrency ? (
        <div className="sticker-card p-6 text-center">
          <p className="text-base font-bold">Pas encore de transactions Stripe à analyser.</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Lance une synchronisation : Scale X récupère les 12 derniers mois en lecture seule et garde les remboursements séparés pour éviter les doubles comptes.
          </p>
          <Button type="button" variant="outline" onClick={refresh} disabled={isPending} className="mt-4 min-h-9">
            <RefreshCw className={cn("size-4", isPending && "motion-safe:animate-spin")} aria-hidden="true" />
            Demander la synchronisation
          </Button>
        </div>
      ) : (
        <>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Indicateurs Stripe">
            <KpiTile label="CA net" value={formatMoney(snapshot.netCents, activeCurrency)} delta={comparisonDelta(snapshot.comparison.netCents)} tone="positive" />
            <KpiTile label="CA brut" value={formatMoney(snapshot.grossCents, activeCurrency)} delta={comparisonDelta(snapshot.comparison.grossCents)} />
            <KpiTile label="Remboursements" value={formatMoney(snapshot.refundsCents, activeCurrency)} detail={`Taux ${formatPercent(snapshot.refundRatePct)}`} tone={snapshot.refundsCents > 0 ? "warning" : "default"} />
            <KpiTile label="Montant à risque" value={formatMoney(snapshot.amountAtRiskCents, activeCurrency)} detail={`${snapshot.failedTransactions} échec${snapshot.failedTransactions > 1 ? "s" : ""} · ${formatPercent(snapshot.failureRatePct)}`} tone={snapshot.amountAtRiskCents > 0 ? "negative" : "default"} />
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <article id="stripe-trend" className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-trend-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="stripe-trend-title" className="text-base font-bold">Tendance du CA net</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Les remboursements sont imputés au mois où ils ont eu lieu.</p>
                </div>
                <p className="text-right text-sm font-bold text-muted-foreground">Ticket moyen<br /><span className="text-foreground">{snapshot.averageTicketCents === null ? "—" : formatMoney(snapshot.averageTicketCents, activeCurrency)}</span></p>
              </div>
              <div className="mt-5 min-w-0" role="img" aria-label={`Graphique de tendance du CA net en ${activeCurrency.toUpperCase()}`} aria-describedby="stripe-trend-summary">
                <StripeTrendChart data={trend} currency={activeCurrency} />
              </div>
            </article>

            <article className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-mix-title">
              <h3 id="stripe-mix-title" className="text-base font-bold">Mix et fidélité</h3>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <div><dt className="text-xs font-bold text-muted-foreground">Transactions réussies</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.successfulTransactions}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">Échecs</dt><dd className="mt-1 text-xl font-bold tabular-nums text-state-critical">{snapshot.failedTransactions}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">Part récurrente</dt><dd className="mt-1 text-xl font-bold tabular-nums text-accent-2-text">{formatPercent(snapshot.recurringSharePct)}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">Clients récurrents</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.repeatCustomers === null ? "—" : snapshot.repeatCustomers}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">Clients connus</dt><dd className="mt-1 text-xl font-bold tabular-nums">{snapshot.uniqueCustomers === null ? "—" : snapshot.uniqueCustomers}</dd></div>
                <div><dt className="text-xs font-bold text-muted-foreground">Concentration max.</dt><dd className="mt-1 text-xl font-bold tabular-nums">{formatPercent(snapshot.topCustomerSharePct)}</dd></div>
              </dl>
              <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                {snapshot.customersWithoutId > 0 ? `${snapshot.customersWithoutId} transaction${snapshot.customersWithoutId > 1 ? "s" : ""} sans customer Stripe : les ratios clients sont des minimums connus.` : "Tous les paiements réussis ont un customer Stripe exploitable."}
              </p>
            </article>
          </div>

          <section className="min-w-0" aria-labelledby="stripe-signals-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 id="stripe-signals-title" className="text-lg font-bold">Signaux à traiter</h3>
                <p className="mt-1 text-sm text-muted-foreground">Chaque carte affiche la preuve chiffrée et l’action suivante, sans laisser l’IA inventer le diagnostic.</p>
              </div>
              <p className="text-xs font-bold text-muted-foreground">{`${signals.length} ${signals.length > 1 ? "signaux" : "signal"} · échantillon ${snapshot.successfulTransactions + snapshot.failedTransactions}`}</p>
            </div>
            <div className="grid min-w-0 gap-4 lg:grid-cols-2">
              {signals.map((signal) => (
                <article key={signal.type} className="sticker-card min-w-0 p-5" aria-labelledby={`stripe-signal-${signal.type}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className={cn("mt-0.5 rounded-full px-2.5 py-1 text-[11px] font-bold", priorityClass(signal.priority))}>{priorityLabel(signal.priority)}</span>
                      <h4 id={`stripe-signal-${signal.type}`} className="min-w-0 text-base font-bold">{signal.title}</h4>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-9 border-accent-2-border text-accent-2-text hover:border-accent-2-border hover:bg-accent-2-soft"
                      onClick={() => generate(signal)}
                      disabled={isPending || activeSignal !== null || signal.type === "insufficient_data"}
                      aria-label={`Faire formuler une action pour ${signal.title}`}
                    >
                      <Sparkles className="size-4" aria-hidden="true" />
                      {activeSignal === signal.type ? "Formulation…" : "Formuler avec l’IA"}
                    </Button>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{signal.summary}</p>
                  <ul className="mt-3 space-y-1.5 text-sm font-bold">
                    {signal.evidence.map((evidence) => <li key={evidence} className="flex gap-2"><span className="text-accent-2-text" aria-hidden="true">•</span><span>{evidence}</span></li>)}
                  </ul>
                  <p className="mt-4 border-t border-border pt-3 text-sm font-bold text-accent-2-text">Prochaine action : {signal.action}</p>
                </article>
              ))}
            </div>
          </section>

          {insightText ? (
            <article className="rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft p-5" aria-labelledby="stripe-ai-insight-title" aria-live="polite">
              <div className="flex items-center gap-2 text-accent-2-text"><Sparkles className="size-4" aria-hidden="true" /><h3 id="stripe-ai-insight-title" className="text-sm font-bold">Formulation de l’agent</h3></div>
              <p className="mt-3 max-w-3xl whitespace-pre-line text-sm leading-6 text-foreground">{insightText}</p>
            </article>
          ) : null}

          <section id="stripe-transactions" className="sticker-card min-w-0 p-5 sm:p-6" aria-labelledby="stripe-transactions-title">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h3 id="stripe-transactions-title" className="text-lg font-bold">Transactions de la période</h3>
                <p className="mt-1 text-sm text-muted-foreground">Table complète et consultable : les identifiants sont tronqués, aucune donnée carte n’est affichée.</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Filtres des transactions">
                <Filter className="size-4 text-muted-foreground" aria-hidden="true" />
                <label htmlFor="stripe-status-filter" className="sr-only">Filtrer par statut</label>
                <select id="stripe-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(parseStatusFilter(event.target.value))} className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
                  {STATUS_FILTER_OPTIONS.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
                </select>
                <label htmlFor="stripe-type-filter" className="sr-only">Filtrer par type de paiement</label>
                <select id="stripe-type-filter" value={paymentTypeFilter} onChange={(event) => setPaymentTypeFilter(parsePaymentTypeFilter(event.target.value))} className="min-h-9 max-w-full rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
                  {PAYMENT_TYPE_FILTER_OPTIONS.map((value) => <option key={value} value={value}>{PAYMENT_TYPE_LABELS[value]}</option>)}
                </select>
              </div>
            </div>

            {selectedTransaction ? (
              <aside className="mt-4 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft p-4" aria-labelledby="stripe-transaction-detail-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p id="stripe-transaction-detail-title" className="text-sm font-bold">Détail de la transaction</p><p className="mt-1 break-all text-xs text-muted-foreground">Charge {selectedTransaction.id}</p></div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(null)}>Fermer</Button>
                </div>
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted-foreground">Date</dt><dd className="font-bold">{formatDate(selectedTransaction.occurredAt)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Montant</dt><dd className="font-bold">{formatMoney(selectedTransaction.amountCents, activeCurrency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Remboursé</dt><dd className="font-bold">{formatMoney(selectedTransaction.amountRefundedCents, activeCurrency)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Customer Stripe</dt><dd className="break-all font-bold">{selectedTransaction.customerId ?? "Non renseigné"}</dd></div>
                </dl>
              </aside>
            ) : null}

            <div className="mt-5 max-w-full overflow-x-auto rounded-[var(--radius-control)] border border-border">
              <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                <caption className="sr-only">Transactions Stripe filtrées de la période</caption>
                <thead className="bg-surface-sunken text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-bold">Charge</th>
                    <th scope="col" className="px-3 py-3 font-bold">Date</th>
                    <th scope="col" className="px-3 py-3 font-bold">Montant</th>
                    <th scope="col" className="px-3 py-3 font-bold">Type</th>
                    <th scope="col" className="px-3 py-3 font-bold">Statut</th>
                    <th scope="col" className="px-3 py-3 text-right font-bold">Détail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id} className="transition-colors hover:bg-muted/40">
                      <th scope="row" className="max-w-[170px] truncate px-3 py-3 font-mono text-xs font-bold" title={transaction.id}>{transaction.id.slice(-12)}</th>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(transaction.occurredAt)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-bold tabular-nums">
                        {formatMoney(transaction.amountCents, activeCurrency)}
                        {transaction.amountRefundedCents > 0 ? <span className="block text-xs font-normal text-state-caution">− {formatMoney(transaction.amountRefundedCents, activeCurrency)} remboursé</span> : null}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{paymentTypeLabel(transaction.paymentType)}</td>
                      <td className="px-3 py-3"><StatusBadge status={transactionStatusLabel(transaction)} /></td>
                      <td className="px-3 py-3 text-right"><Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTransactionId(transaction.id)} aria-label={`Voir le détail de ${transaction.id}`}>Voir</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTransactions.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune transaction ne correspond à ces filtres.</p> : null}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
