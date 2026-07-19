"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { computeClosingRates } from "@/lib/closing/metrics";
import { MONTH_LABELS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { revenuePerCall, toClosingTotals, toFunnelTotals } from "@/lib/monthly-metrics/rates";
import { computeFunnelRates, formatPercent } from "@/lib/setting/funnel";

import { saveMonthlyMetrics } from "./actions";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

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

function NumberField({
  label,
  value,
  onChange,
  warning,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  warning?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
        className={inputClass}
      />
      {warning && <span className="text-xs font-medium text-state-caution">{warning}</span>}
    </label>
  );
}

// Never auto-fills — always a dismissible suggestion the user applies by
// clicking, per CLAUDE.md's rule against Contenu/Suivi des ventes silently
// overwriting Datas numbers.
function SuggestionBanner({ text, onApply }: { text: string; onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent-border bg-accent-soft px-3 py-2 text-xs text-accent-text">
      <span>{text}</span>
      <button type="button" onClick={onApply} className="font-medium underline underline-offset-2">
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
  onClose,
  onNavigate,
}: {
  year: number;
  month: number;
  initialData: MonthlyMetricsRow | null;
  monthRowsThisYear: MonthlyMetricsRow[];
  postLeadsThisMonth: number;
  salesThisMonth: { contracted: number; collected: number; closedCount: number } | undefined;
  onClose: () => void;
  onNavigate: (nextYear: number, nextMonth: number) => void;
}) {
  const router = useRouter();
  const initial = toDraft(initialData);
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
      const result = await saveMonthlyMetrics(year, month, draft);
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
            <p className="font-medium">Tu as des modifications non enregistrées</p>
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
                <DialogTitle className="font-display text-lg font-medium">
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
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  💰 Finance
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="CA collecté (€)"
                    value={draft.cashCollected}
                    onChange={(v) => update({ cashCollected: v })}
                  />
                  <NumberField
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
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  📩 Setting · prospection
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Nouveaux abonnés"
                    value={draft.newFollowers}
                    onChange={(v) => update({ newFollowers: v })}
                  />
                  <NumberField
                    label="Premiers messages envoyés"
                    value={draft.firstMessages}
                    onChange={(v) => update({ firstMessages: v })}
                  />
                  <NumberField
                    label="Conversations démarrées"
                    value={draft.conversations}
                    onChange={(v) => update({ conversations: v })}
                  />
                  <NumberField
                    label="Appels proposés"
                    value={draft.callsProposed}
                    onChange={(v) => update({ callsProposed: v })}
                  />
                  <NumberField
                    label="Appels réservés"
                    value={draft.callsBooked}
                    onChange={(v) => update({ callsBooked: v })}
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
                {postLeadsThisMonth > 0 && postLeadsThisMonth !== draft.newFollowers && (
                  <SuggestionBanner
                    text={`Tes posts de Contenu totalisent ${postLeadsThisMonth} leads ce mois.`}
                    onApply={() => update({ newFollowers: postLeadsThisMonth })}
                  />
                )}
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  📞 Closing
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Appels pris"
                    value={draft.callsTaken}
                    onChange={(v) => update({ callsTaken: v })}
                    warning={callsTakenWarning}
                  />
                  <NumberField
                    label="Ventes conclues"
                    value={draft.salesClosed}
                    onChange={(v) => update({ salesClosed: v })}
                    warning={salesClosedWarning}
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
                {salesThisMonth && salesThisMonth.closedCount > 0 && salesThisMonth.closedCount !== draft.salesClosed && (
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
                  <span className="text-sm font-medium text-state-healthy">Enregistré ✓</span>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
