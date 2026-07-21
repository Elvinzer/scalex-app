"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { KpiNumberField, type KpiFieldSource } from "@/components/kpi-number-field";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { formatEur } from "@/lib/currency";
import { computeClosingRates } from "@/lib/closing/metrics";
import { monthDateRange } from "@/lib/date-range";
import { MONTH_LABELS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay, stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import { revenuePerCall, toClosingTotals, toFunnelTotals } from "@/lib/monthly-metrics/rates";
import { computeFunnelRates, formatPercent } from "@/lib/setting/funnel";

import { saveMonthlyMetrics } from "./actions";

const SETTING_SOURCE: KpiFieldSource = {
  text: "Calculé depuis ton suivi quotidien — modifier dans Avancé → Suivi setting quotidien.",
  href: "/acquisition/setting",
  linkLabel: "Aller au suivi quotidien",
};
const CLOSING_SOURCE: KpiFieldSource = {
  text: "Calculé depuis ton suivi quotidien — modifier dans Avancé → Module closing quotidien.",
  href: "/ventes/closing",
  linkLabel: "Aller au suivi quotidien",
};

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
  const [draft, setDraft] = useState<MonthlyMetricsInput>(initial);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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

  return (
    <Dialog open onOpenChange={(next) => !next && requestClose()}>
      <DialogContent>
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
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
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

            <div className="mt-6 flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  💰 Finance
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiNumberField
                    label="CA collecté (€)"
                    value={draft.cashCollected}
                    onChange={(v) => update({ cashCollected: v })}
                  />
                  <KpiNumberField
                    label="CA contracté (€)"
                    value={draft.cashContracted}
                    onChange={(v) => update({ cashContracted: v })}
                  />
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
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  📩 Setting · prospection
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
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  📞 Closing
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
