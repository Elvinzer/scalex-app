"use client";

import { ChevronLeft, ChevronRight, PencilLine, Phone, Send, Sparkles, WalletCards, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { KpiNumberField, type KpiFieldSource } from "@/components/kpi-number-field";
import { MonthlyKpiImport } from "@/components/import/monthly-kpi-import";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { formatEur } from "@/lib/currency";
import { computeClosingRates } from "@/lib/closing/metrics";
import { monthDateRange } from "@/lib/date-range";
import { MONTH_LABELS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { CLOSING_FIELDS, resolveDailySourceOverlay, SETTING_FIELDS, stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import { revenuePerCall, toClosingTotals, toFunnelTotals } from "@/lib/monthly-metrics/rates";
import { computeFunnelRates, formatPercent } from "@/lib/setting/funnel";

import { saveMonthlyMetrics } from "./actions";

const SETTING_SOURCE: KpiFieldSource = {
  text: "Calculé depuis ton suivi quotidien. Modifiable dans Pipeline → Funnel journalier.",
  href: "/acquisition/pipeline/funnel",
  linkLabel: "Aller au suivi quotidien",
};
const CLOSING_SOURCE: KpiFieldSource = {
  text: "Calculé depuis ton suivi quotidien. Modifiable dans Suivi d'appel → Funnel de closing.",
  href: "/ventes/appels/funnel",
  linkLabel: "Aller au suivi quotidien",
};

const SYNC_DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

function stripeSource(syncedAt: Date | null): KpiFieldSource {
  return {
    text: syncedAt ? `Synchronisé depuis Stripe le ${SYNC_DATE_FORMAT.format(syncedAt)}.` : "Synchronisé depuis Stripe.",
    href: "/integrations",
    linkLabel: "Voir mes intégrations",
  };
}

function toDraft(row: MonthlyMetricsRow | null): MonthlyMetricsInput {
  return {
    cashCollected: row?.cashCollected ?? null,
    cashContracted: row?.cashContracted ?? null,
    newFollowers: row?.newFollowers ?? null,
    firstMessages: row?.firstMessages ?? null,
    conversations: row?.conversations ?? null,
    callsProposed: row?.callsProposed ?? null,
    callsBooked: row?.callsBooked ?? null,
    callsTaken: row?.callsTaken ?? null,
    salesClosed: row?.salesClosed ?? null,
  };
}

function sameDraft(a: MonthlyMetricsInput, b: MonthlyMetricsInput): boolean {
  return (Object.keys(a) as (keyof MonthlyMetricsInput)[]).every((key) => a[key] === b[key]);
}

// Never auto-fills — always a dismissible suggestion the user applies by
// clicking, per CLAUDE.md's rule against Contenu/Suivi des ventes silently
// overwriting Datas numbers. (Doesn't apply to Setting/Closing daily entries
// below — those measure the exact same field, not an independent estimate
// from another module, so KpiNumberField's disabledReason auto-fills instead.)
function SuggestionBanner({ text, onApply }: { text: string; onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-xs text-accent-text">
      <span>{text}</span>
      <button type="button" onClick={onApply} className="font-bold underline underline-offset-2">
        Utiliser
      </button>
    </div>
  );
}

type PendingAction = null | "close" | { type: "navigate"; delta: number };

export function MonthModal({
  year,
  month,
  initialData,
  monthRowsThisYear,
  postLeadsThisMonth,
  salesThisMonth,
  pipelineVolumesThisMonth,
  allSettingEntries,
  allClosingEntries,
  onClose,
  onNavigate,
}: {
  year: number;
  month: number;
  initialData: MonthlyMetricsRow | null;
  monthRowsThisYear: MonthlyMetricsRow[];
  postLeadsThisMonth: number;
  salesThisMonth: { contracted: number; collected: number; closedCount: number } | undefined;
  pipelineVolumesThisMonth: { conversations: number; callsBooked: number; callsTaken: number } | undefined;
  allSettingEntries: (typeof settingKpiEntries.$inferSelect)[];
  allClosingEntries: (typeof closingKpiEntries.$inferSelect)[];
  onClose: () => void;
  onNavigate: (nextYear: number, nextMonth: number) => void;
}) {
  const router = useRouter();
  // Recomputed on every month navigation (no server round-trip) — same
  // pattern as monthRowsThisYear, which is also sliced client-side already.
  const dailySourceOverlay = useMemo(
    () => resolveDailySourceOverlay(monthDateRange(year, month), allSettingEntries, allClosingEntries),
    [year, month, allSettingEntries, allClosingEntries]
  );
  const { settingSourced, closingSourced } = dailySourceOverlay;
  const initial = { ...toDraft(initialData), ...dailySourceOverlay.overrides };
  const cashCollectedSynced = initialData?.cashCollectedSource === "stripe";
  const cashCollectedStale = initialData?.cashCollectedSource === "stripe_stale";
  const newCustomersSynced = initialData?.newCustomersSource === "stripe" || initialData?.newCustomersSource === "stripe_stale";
  const [draft, setDraft] = useState<MonthlyMetricsInput>(initial);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [entryMode, setEntryMode] = useState<"import" | "manual">("import");
  const [importAppliedCount, setImportAppliedCount] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDirty = !sameDraft(draft, initial);

  function update(patch: Partial<MonthlyMetricsInput>) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function adjacentMonth(delta: number): { year: number; month: number } {
    const nextMonth = month + delta;
    const nextYear = nextMonth < 1 ? year - 1 : nextMonth > 12 ? year + 1 : year;
    return { year: nextYear, month: ((nextMonth - 1 + 12) % 12) + 1 };
  }

  function requestClose() {
    if (isDirty) {
      setPendingAction("close");
    } else {
      onClose();
    }
  }

  function requestNavigate(delta: number) {
    if (isDirty) {
      setPendingAction({ type: "navigate", delta });
    } else {
      const next = adjacentMonth(delta);
      onNavigate(next.year, next.month);
    }
  }

  function handleSave(after?: () => void) {
    startTransition(async () => {
      const payload = stripDailySourcedFields(draft, { settingSourced, closingSourced });
      const result = await saveMonthlyMetrics(year, month, payload);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setSaveError(null);
      setSaved(true);
      setImportAppliedCount(null);
      router.refresh();
      after?.();
    });
  }

  function discardAndProceed() {
    if (pendingAction === "close") onClose();
    else if (pendingAction?.type === "navigate") {
      const next = adjacentMonth(pendingAction.delta);
      onNavigate(next.year, next.month);
    }
    setPendingAction(null);
  }

  function saveAndProceed() {
    handleSave(() => {
      if (pendingAction === "close") onClose();
      else if (pendingAction?.type === "navigate") {
        const next = adjacentMonth(pendingAction.delta);
        onNavigate(next.year, next.month);
      }
      setPendingAction(null);
    });
  }

  const cumulCollected = monthRowsThisYear
    .filter((row) => row.month <= month)
    .reduce((sum, row) => sum + (row.month === month ? (draft.cashCollected ?? 0) : (row.cashCollected ?? 0)), 0);

  const settingRates = computeFunnelRates(toFunnelTotals(draft));
  const closingRates = computeClosingRates(toClosingTotals(draft), draft.callsBooked ?? 0);
  const perCall = revenuePerCall(draft.cashContracted, draft.callsTaken);

  const callsTakenWarning =
    draft.callsTaken !== null && draft.callsBooked !== null && draft.callsTaken > draft.callsBooked
      ? "Vérifie ce chiffre"
      : undefined;
  const salesClosedWarning =
    draft.salesClosed !== null && draft.callsTaken !== null && draft.salesClosed > draft.callsTaken
      ? "Vérifie ce chiffre"
      : undefined;

  const blockedImportFields = useMemo(
    () => [
      ...(cashCollectedSynced ? (["cashCollected"] as const) : []),
      ...(settingSourced ? SETTING_FIELDS : []),
      ...(closingSourced ? CLOSING_FIELDS : []),
    ],
    [cashCollectedSynced, closingSourced, settingSourced]
  );

  return (
    <Dialog open onOpenChange={(next) => !next && requestClose()}>
      <DialogContent className="max-w-2xl p-0">
        {pendingAction ? (
          <div className="flex flex-col gap-4 p-2 text-center">
            <p className="font-bold">Tu as des modifications non enregistrées</p>
            <div className="flex justify-center gap-3">
              <Button onClick={saveAndProceed} disabled={isPending}>
                Enregistrer
              </Button>
              <Button variant="outline" onClick={discardAndProceed}>
                Quitter sans sauver
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4 px-6 pt-6">
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text">
                  <WalletCards className="size-5" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  onClick={() => requestNavigate(-1)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  aria-label="Mois précédent"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <DialogTitle className="font-display text-lg font-bold">
                  {MONTH_LABELS[month - 1]} {year}
                </DialogTitle>
                <button
                  type="button"
                  onClick={() => requestNavigate(1)}
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                aria-label="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="px-6 pt-4">
              <p className="text-sm text-muted-foreground">
                Ajoute les données de {MONTH_LABELS[month - 1].toLowerCase()} en quelques secondes. Falco peut reconnaître ton tableau automatiquement.
              </p>
            </div>

            <div className="mx-6 mt-5 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1" role="tablist" aria-label="Méthode de saisie">
              <button
                type="button"
                role="tab"
                aria-selected={entryMode === "import"}
                onClick={() => setEntryMode("import")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent-2 ${
                  entryMode === "import" ? "bg-card text-accent-2-text shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="size-4" aria-hidden="true" />
                Import intelligent
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={entryMode === "manual"}
                onClick={() => setEntryMode("manual")}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  entryMode === "manual" ? "bg-card text-accent-text shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <PencilLine className="size-4" aria-hidden="true" />
                Saisie manuelle
              </button>
            </div>

            {entryMode === "import" ? (
              <div className="flex flex-col gap-4 px-6 py-5">
                <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft/60 p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-2 text-white shadow-[0_4px_12px_var(--accent-2-glow)]">
                    <Sparkles className="size-4" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-accent-2-text">Falco trie ton tableau pour toi</p>
                    <p className="mt-1 text-xs leading-5 text-accent-2-text/80">
                      Envoie un CSV/Excel ou colle tes cellules. Il associe les bons chiffres aux 9 indicateurs de ce mois, puis te montre le résultat avant toute validation.
                    </p>
                  </div>
                </div>
                <MonthlyKpiImport
                  period={{ year, month }}
                  blockedFields={blockedImportFields}
                  onApply={(values, count) => {
                    update(values);
                    setImportAppliedCount(count);
                    setEntryMode("manual");
                  }}
                />
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-6 px-6 pb-6">
              {importAppliedCount !== null && (
                <div className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 px-3 py-3" role="status">
                  <div>
                    <p className="text-sm font-bold text-accent-2-text">{importAppliedCount} valeur{importAppliedCount > 1 ? "s" : ""} prête{importAppliedCount > 1 ? "s" : ""} à vérifier</p>
                    <p className="mt-1 text-xs text-accent-2-text/80">Relis les champs puis clique sur Enregistrer pour confirmer.</p>
                  </div>
                  <button type="button" onClick={() => setEntryMode("import")} className="shrink-0 text-xs font-bold text-accent-2-text underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-2">
                    Revoir
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <WalletCards className="size-4" aria-hidden="true" />
                  Finance
                </p>
                {cashCollectedStale && (
                  <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs font-bold text-state-caution">
                    Stripe déconnecté, chiffres figés au{" "}
                    {initialData?.cashCollectedSyncedAt ? SYNC_DATE_FORMAT.format(initialData.cashCollectedSyncedAt) : "?"}. Tu
                    peux à nouveau saisir ce champ à la main.
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiNumberField
                    label="CA collecté (€)"
                    value={draft.cashCollected}
                    onChange={(v) => update({ cashCollected: v })}
                    disabledReason={cashCollectedSynced ? stripeSource(initialData?.cashCollectedSyncedAt ?? null) : undefined}
                  />
                  <KpiNumberField
                    label="CA contracté (€)"
                    value={draft.cashContracted}
                    onChange={(v) => update({ cashContracted: v })}
                  />
                  {newCustomersSynced && (
                    <KpiNumberField
                      label="Nouveaux clients"
                      value={initialData?.newCustomers ?? null}
                      onChange={() => {}}
                      disabledReason={stripeSource(initialData?.newCustomersSyncedAt ?? null)}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Cumul annuel collecté : {formatEur(cumulCollected)}
                </p>
                {salesThisMonth && salesThisMonth.contracted > 0 && salesThisMonth.contracted !== draft.cashContracted && (
                  <SuggestionBanner
                    text={`Tes ventes de Suivi des ventes totalisent ${formatEur(salesThisMonth.contracted)} contracté, ${formatEur(salesThisMonth.collected)} encaissé ce mois.`}
                    onApply={() =>
                      update({ cashContracted: salesThisMonth.contracted, cashCollected: salesThisMonth.collected })
                    }
                  />
                )}
              </div>

              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <Send className="size-4" aria-hidden="true" />
                  Setting · prospection
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiNumberField
                    label="Nouveaux abonnés"
                    value={draft.newFollowers}
                    onChange={(v) => update({ newFollowers: v })}
                    disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                  />
                  <KpiNumberField
                    label="Premiers messages envoyés"
                    value={draft.firstMessages}
                    onChange={(v) => update({ firstMessages: v })}
                    disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                  />
                  <KpiNumberField
                    label="Conversations démarrées"
                    value={draft.conversations}
                    onChange={(v) => update({ conversations: v })}
                    disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                  />
                  <KpiNumberField
                    label="Appels proposés"
                    value={draft.callsProposed}
                    onChange={(v) => update({ callsProposed: v })}
                    disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                  />
                  <KpiNumberField
                    label="Appels réservés"
                    value={draft.callsBooked}
                    onChange={(v) => update({ callsBooked: v })}
                    disabledReason={settingSourced ? SETTING_SOURCE : undefined}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Taux de réponse :{" "}
                    {settingRates.responseRate === null ? "—" : formatPercent(settingRates.responseRate)}
                  </span>
                  <span>
                    Taux d&apos;appels proposés :{" "}
                    {settingRates.proposalRate === null ? "—" : formatPercent(settingRates.proposalRate)}
                  </span>
                  <span>
                    Taux de réservation :{" "}
                    {settingRates.bookingRate === null ? "—" : formatPercent(settingRates.bookingRate)}
                  </span>
                </div>
                {!settingSourced && postLeadsThisMonth > 0 && postLeadsThisMonth !== draft.newFollowers && (
                  <SuggestionBanner
                    text={`Tes posts de Contenu totalisent ${postLeadsThisMonth} leads ce mois.`}
                    onApply={() => update({ newFollowers: postLeadsThisMonth })}
                  />
                )}
                {!settingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.conversations > 0 &&
                  pipelineVolumesThisMonth.conversations !== draft.conversations && (
                    <SuggestionBanner
                      text={`Ton pipeline Acquisition recense ${pipelineVolumesThisMonth.conversations} conversation${pipelineVolumesThisMonth.conversations > 1 ? "s" : ""} démarrée${pipelineVolumesThisMonth.conversations > 1 ? "s" : ""} ce mois.`}
                      onApply={() => update({ conversations: pipelineVolumesThisMonth.conversations })}
                    />
                  )}
                {!settingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.callsBooked > 0 &&
                  pipelineVolumesThisMonth.callsBooked !== draft.callsBooked && (
                    <SuggestionBanner
                      text={`Ton pipeline Acquisition recense ${pipelineVolumesThisMonth.callsBooked} RDV fixé${pipelineVolumesThisMonth.callsBooked > 1 ? "s" : ""} ce mois.`}
                      onApply={() => update({ callsBooked: pipelineVolumesThisMonth.callsBooked })}
                    />
                  )}
              </div>

              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <Phone className="size-4" aria-hidden="true" />
                  Closing
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiNumberField
                    label="Appels pris"
                    value={draft.callsTaken}
                    onChange={(v) => update({ callsTaken: v })}
                    warning={callsTakenWarning}
                    disabledReason={closingSourced ? CLOSING_SOURCE : undefined}
                  />
                  <KpiNumberField
                    label="Ventes conclues"
                    value={draft.salesClosed}
                    onChange={(v) => update({ salesClosed: v })}
                    warning={salesClosedWarning}
                    disabledReason={closingSourced ? CLOSING_SOURCE : undefined}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Taux de présence :{" "}
                    {closingRates.showUpRate === null ? "—" : formatPercent(closingRates.showUpRate)}
                  </span>
                  <span>
                    Taux de no-show :{" "}
                    {closingRates.noShowRate === null ? "—" : formatPercent(closingRates.noShowRate)}
                  </span>
                  <span>
                    Taux de closing :{" "}
                    {closingRates.closingRate === null ? "—" : formatPercent(closingRates.closingRate)}
                  </span>
                  <span>Revenu par appel : {perCall === null ? "—" : formatEur(perCall)}</span>
                </div>
                {!closingSourced && salesThisMonth && salesThisMonth.closedCount > 0 && salesThisMonth.closedCount !== draft.salesClosed && (
                  <SuggestionBanner
                    text={`Suivi des ventes recense ${salesThisMonth.closedCount} vente${salesThisMonth.closedCount > 1 ? "s" : ""} conclue${salesThisMonth.closedCount > 1 ? "s" : ""} ce mois.`}
                    onApply={() => update({ salesClosed: salesThisMonth.closedCount })}
                  />
                )}
                {!closingSourced &&
                  pipelineVolumesThisMonth &&
                  pipelineVolumesThisMonth.callsTaken > 0 &&
                  pipelineVolumesThisMonth.callsTaken !== draft.callsTaken && (
                    <SuggestionBanner
                      text={`Ton pipeline Acquisition recense ${pipelineVolumesThisMonth.callsTaken} RDV honoré${pipelineVolumesThisMonth.callsTaken > 1 ? "s" : ""} ce mois.`}
                      onApply={() => update({ callsTaken: pipelineVolumesThisMonth.callsTaken })}
                    />
                  )}
              </div>

              {saveError && <p className="text-sm text-state-critical">{saveError}</p>}

              <div className="flex items-center justify-between gap-4">
                <Button onClick={() => handleSave()} disabled={isPending}>
                  {isPending ? "Enregistrement..." : "Enregistrer"}
                </Button>
                {saved && !isDirty && (
                  <span className="text-sm font-bold text-state-healthy">Enregistré ✓</span>
                )}
              </div>
            </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
