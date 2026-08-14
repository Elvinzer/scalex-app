"use client";

import { useEffect, useState, useTransition, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";

import type { SalesCallRow } from "@/lib/iclosed/calls";

import { setCallAmounts, setCallDecisionDue, setCallResult } from "./actions";

export type CallPaymentType = "one_shot" | "installments";

export type Result = "no_show" | "not_closed" | "awaiting_decision" | "closed";

// Trigger tint per outcome — reuses the existing DA state tokens. "Attente
// décision" stays neutral on purpose (caution/unknown/healthy are already
// taken by the other outcomes); its urgency colour lives on the date badge
// instead.
export const RESULT_TINT: Record<Result, string> = {
  no_show: "border-state-caution bg-state-caution/15 text-state-caution",
  not_closed: "border-state-unknown bg-state-unknown-bg text-state-unknown",
  awaiting_decision: "border-border bg-background text-foreground",
  closed: "border-state-healthy bg-state-healthy-bg text-state-healthy",
};

export const RESULT_ORDER: Result[] = ["no_show", "not_closed", "awaiting_decision", "closed"];

export function deriveResult(call: SalesCallRow): Result | null {
  if (call.attendance === "no_show") return "no_show";
  if (call.outcome === "closed") return "closed";
  if (call.outcome === "not_closed") return "not_closed";
  if (call.outcome === "awaiting_decision") return "awaiting_decision";
  return null;
}

// Urgency of an expected-answer date, in the viewer's local calendar days.
// Computed in code (never LLM). Critical = today/overdue, caution = ≤3 j,
// healthy = further out.
export type Tone = "critical" | "caution" | "healthy";

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function decisionUrgency(iso: string): { tone: Tone; days: number } {
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return { tone: "critical", days };
  if (days === 0) return { tone: "critical", days };
  if (days <= 3) return { tone: "caution", days };
  return { tone: "healthy", days };
}

export const TONE_TEXT: Record<Tone, string> = {
  critical: "text-state-critical",
  caution: "text-state-caution",
  healthy: "text-state-healthy",
};
export const TONE_DOT: Record<Tone, string> = {
  critical: "bg-state-critical",
  caution: "bg-state-caution",
  healthy: "bg-state-healthy",
};

// Shared outcome-editing state + server-action wiring — used by both the
// table row (calls-table.tsx) and the detail drawer (call-detail-drawer.tsx,
// reached from "Décisions en attente", which can point at a call outside the
// table's current period) so marking a call won/lost/no-show/etc. works from
// either entry point, not just the table. Accepts a nullable call because
// the drawer renders before a call is selected (hooks can't be called
// conditionally); every handler below is a no-op while call is null.
export function useCallOutcome(call: SalesCallRow | null) {
  const [result, setResult] = useState<Result | null>(call ? deriveResult(call) : null);
  const [contracted, setContracted] = useState(call?.contracted != null ? String(call.contracted) : "");
  const [collected, setCollected] = useState(call?.collected != null ? String(call.collected) : "");
  const [paymentType, setPaymentType] = useState<CallPaymentType>(call?.installmentCount && call.installmentCount > 1 ? "installments" : "one_shot");
  const [installmentCount, setInstallmentCount] = useState(call?.installmentCount && call.installmentCount > 1 ? call.installmentCount : 3);
  const [dueDate, setDueDate] = useState(call?.decisionDueAt ? call.decisionDueAt.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Resync local state when the underlying call changes identity without
  // this component unmounting. A no-op for the table row (each row already
  // remounts per call via `key={call.id}` in calls-table.tsx's .map()), but
  // required for the drawer: a single long-lived instance whose `call` prop
  // swaps as the user opens a different call without closing it first.
  useEffect(() => {
    setResult(call ? deriveResult(call) : null);
    setContracted(call?.contracted != null ? String(call.contracted) : "");
    setCollected(call?.collected != null ? String(call.collected) : "");
    setPaymentType(call?.installmentCount && call.installmentCount > 1 ? "installments" : "one_shot");
    setInstallmentCount(call?.installmentCount && call.installmentCount > 1 ? call.installmentCount : 3);
    setDueDate(call?.decisionDueAt ? call.decisionDueAt.slice(0, 10) : "");
    setError(null);
    // Depend on the id, not the call object itself — a revalidatePath after
    // this same hook's own commitAmounts/chooseResult calls hands back a
    // fresh `call` reference for the SAME call, which must not reset
    // whatever the user is mid-typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  function chooseResult(next: Result | "") {
    if (!call) return;
    const value = next === "" ? null : next;
    setResult(value);
    setError(null);
    if (value !== "closed") {
      setContracted("");
      setCollected("");
      setPaymentType("one_shot");
      setInstallmentCount(3);
    }
    if (value !== "awaiting_decision") setDueDate("");
    if (value) {
      startTransition(async () => {
        const res = await setCallResult(call.id, value);
        if (res.error) setError(res.error);
      });
    }
  }

  function commitDueDate(value: string) {
    if (!call) return;
    setDueDate(value);
    setError(null);
    if (!value) return; // clearing the field is a no-op; change the status to exit awaiting
    startTransition(async () => {
      const res = await setCallDecisionDue(call.id, value);
      if (res.error) setError(res.error);
    });
  }

  function commitAmounts() {
    if (!call) return;
    setError(null);
    const contractedValue = Number.parseInt(contracted || "0", 10);
    const collectedValue = Number.parseInt(collected || "0", 10);
    const effectivePaymentType: CallPaymentType = paymentType === "installments" || collectedValue < contractedValue ? "installments" : "one_shot";
    const effectiveInstallmentCount = effectivePaymentType === "installments" ? Math.min(12, Math.max(2, installmentCount)) : null;
    startTransition(async () => {
      const res = await setCallAmounts(
        call.id,
        contractedValue,
        collectedValue,
        effectivePaymentType,
        effectiveInstallmentCount,
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      // A partial one-shot entry cannot be represented faithfully. The server
      // normalizes it to the legacy two-row schedule, so keep the controls in
      // sync until the user explicitly chooses a different count.
      if (effectivePaymentType !== paymentType) setPaymentType(effectivePaymentType);
      if (effectiveInstallmentCount !== null) setInstallmentCount(effectiveInstallmentCount);
    });
  }

  function onAmountKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  const dueUrgency = result === "awaiting_decision" && dueDate ? decisionUrgency(dueDate) : null;

  return {
    result,
    contracted,
    setContracted,
    collected,
    setCollected,
    paymentType,
    setPaymentType,
    installmentCount,
    setInstallmentCount,
    dueDate,
    error,
    chooseResult,
    commitDueDate,
    commitAmounts,
    onAmountKey,
    dueUrgency,
  };
}

export function PaymentPlanControl({
  paymentType,
  installmentCount,
  onPaymentTypeChange,
  onInstallmentCountChange,
  onCommit,
  className,
}: {
  paymentType: CallPaymentType;
  installmentCount: number;
  onPaymentTypeChange: (value: CallPaymentType) => void;
  onInstallmentCountChange: (value: number) => void;
  onCommit: () => void;
  className?: string;
}) {
  const t = useTranslations("app.calls");
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <label className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">{t("payment")}</span>
        <select
          aria-label={t("payment")}
          value={paymentType}
          onChange={(event) => onPaymentTypeChange(event.target.value as CallPaymentType)}
          onBlur={onCommit}
          className="min-h-9 rounded-[var(--radius-control)] border border-border bg-background px-2 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        >
          <option value="one_shot">{t("oneShot")}</option>
          <option value="installments">{t("installments")}</option>
        </select>
      </label>
      {paymentType === "installments" && (
        <label className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{t("installmentCount")}</span>
          <input
            type="number"
            min={2}
            max={12}
            value={installmentCount}
            onChange={(event) => onInstallmentCountChange(Number(event.target.value) || 2)}
            onBlur={onCommit}
            className="w-14 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1.5 text-xs outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </label>
      )}
    </div>
  );
}

export function CallResultSelect({ result, onChange }: { result: Result | null; onChange: (next: Result | "") => void }) {
  const t = useTranslations("app.calls");
  return (
    <select
      aria-label="Issue de l'appel"
      value={result ?? ""}
      onChange={(e) => onChange(e.target.value as Result | "")}
      className={`w-fit rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 ${
        result ? RESULT_TINT[result] : "border-border bg-background text-muted-foreground"
      }`}
    >
      <option value="" disabled>
        {t("toProcess")}
      </option>
      {RESULT_ORDER.map((value) => (
        <option key={value} value={value}>
          {t(`result.${value}`)}
        </option>
      ))}
    </select>
  );
}

export function AmountInput({
  value,
  onChange,
  onCommit,
  onKey,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onKey: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min={0}
        inputMode="numeric"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKey}
        className="w-20 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-right text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
      />
      <span className="text-muted-foreground">€</span>
    </span>
  );
}
