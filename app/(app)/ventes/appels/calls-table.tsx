"use client";

import { MessageSquare } from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";

import type { SalesCallRow } from "@/lib/iclosed/calls";

import { setCallAmounts, setCallDecisionDue, setCallResult } from "./actions";
import { CallDetailDrawer } from "./call-detail-drawer";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Result = "no_show" | "not_closed" | "awaiting_decision" | "closed";

const RESULT_LABEL: Record<Result, string> = {
  no_show: "No-show",
  not_closed: "Non closé",
  awaiting_decision: "Attente décision",
  closed: "Closé",
};

// Trigger tint per outcome — reuses the existing DA state tokens. "Attente
// décision" stays neutral on purpose (caution/unknown/healthy are already taken
// by the other outcomes); its urgency colour lives on the date badge + the
// "Décisions en attente" encart instead.
const RESULT_TINT: Record<Result, string> = {
  no_show: "border-state-caution bg-state-caution/15 text-state-caution",
  not_closed: "border-state-unknown bg-state-unknown-bg text-state-unknown",
  awaiting_decision: "border-border bg-background text-foreground",
  closed: "border-state-healthy bg-state-healthy-bg text-state-healthy",
};

const RESULT_ORDER: Result[] = ["no_show", "not_closed", "awaiting_decision", "closed"];

function deriveResult(call: SalesCallRow): Result | null {
  if (call.attendance === "no_show") return "no_show";
  if (call.outcome === "closed") return "closed";
  if (call.outcome === "not_closed") return "not_closed";
  if (call.outcome === "awaiting_decision") return "awaiting_decision";
  return null;
}

// Urgency of an expected-answer date, in the viewer's local calendar days.
// Computed in code (never LLM). 🔴 today/overdue · 🟠 ≤3 j · 🟢 further out.
type Tone = "critical" | "caution" | "healthy";

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function decisionUrgency(iso: string): { tone: Tone; label: string } {
  const days = Math.round((startOfDay(new Date(iso)) - startOfDay(new Date())) / 86_400_000);
  if (days < 0) return { tone: "critical", label: `En retard de ${-days} j` };
  if (days === 0) return { tone: "critical", label: "Aujourd'hui" };
  if (days <= 3) return { tone: "caution", label: `dans ${days} j` };
  return { tone: "healthy", label: `dans ${days} j` };
}

const TONE_TEXT: Record<Tone, string> = {
  critical: "text-state-critical",
  caution: "text-state-caution",
  healthy: "text-state-healthy",
};
const TONE_DOT: Record<Tone, string> = {
  critical: "bg-state-critical",
  caution: "bg-state-caution",
  healthy: "bg-state-healthy",
};

export function CallsTable({
  calls,
  pendingDecisions,
}: {
  calls: SalesCallRow[];
  pendingDecisions: SalesCallRow[];
}) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  // A pending decision can sit outside the current period, so look it up across
  // both lists for the drawer.
  const selectedCall = selectedCallId
    ? (calls.find((c) => c.id === selectedCallId) ??
      pendingDecisions.find((c) => c.id === selectedCallId) ??
      null)
    : null;

  return (
    <>
      <div className="flex flex-col gap-4">
        <PendingDecisions decisions={pendingDecisions} onOpen={setSelectedCallId} />
        {calls.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">Aucun appel sur cette période</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Change de période, ou attends de nouvelles réservations.
            </p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Date</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Invité</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Closer</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">Issue</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Contracté</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">Collecté</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <CallRow key={call.id} call={call} onOpenComments={setSelectedCallId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CallDetailDrawer
        call={selectedCall}
        open={selectedCallId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCallId(null);
        }}
      />
    </>
  );
}

// The live relance to-do: every call parked in "awaiting_decision" (any period),
// soonest due first, colour-coded by urgency. Calls awaiting a date show last.
function PendingDecisions({
  decisions,
  onOpen,
}: {
  decisions: SalesCallRow[];
  onOpen: (id: string) => void;
}) {
  if (decisions.length === 0) return null;
  const sorted = [...decisions].sort((a, b) => {
    if (!a.decisionDueAt) return 1;
    if (!b.decisionDueAt) return -1;
    return a.decisionDueAt.localeCompare(b.decisionDueAt);
  });

  return (
    <div className="sticker-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">Décisions en attente</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
          {decisions.length}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {sorted.map((call) => {
          const urgency = call.decisionDueAt ? decisionUrgency(call.decisionDueAt) : null;
          return (
            <li
              key={call.id}
              className="flex items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-muted"
            >
              <span className={`size-2 shrink-0 rounded-full ${urgency ? TONE_DOT[urgency.tone] : "bg-state-unknown"}`} />
              <span
                className={`w-32 shrink-0 text-xs font-bold ${urgency ? TONE_TEXT[urgency.tone] : "text-muted-foreground"}`}
              >
                {urgency ? urgency.label : "Date à définir"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{call.inviteeName ?? "—"}</span>
                {call.inviteeEmail && (
                  <span className="ml-2 text-xs text-muted-foreground">{call.inviteeEmail}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onOpen(call.id)}
                className="shrink-0 rounded-[var(--radius-control)] px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-background"
              >
                voir
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CallRow({ call, onOpenComments }: { call: SalesCallRow; onOpenComments: (callId: string) => void }) {
  const [result, setResult] = useState<Result | null>(deriveResult(call));
  const [contracted, setContracted] = useState(call.contracted != null ? String(call.contracted) : "");
  const [collected, setCollected] = useState(call.collected != null ? String(call.collected) : "");
  const [dueDate, setDueDate] = useState(call.decisionDueAt ? call.decisionDueAt.slice(0, 10) : "");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const cancelled = call.attendance === "cancelled";
  const isFuture = new Date(call.scheduledAt).getTime() > Date.now();

  function chooseResult(next: Result | "") {
    const value = next === "" ? null : next;
    setResult(value);
    setError(null);
    if (value !== "closed") {
      setContracted("");
      setCollected("");
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
    setDueDate(value);
    setError(null);
    if (!value) return; // clearing the field is a no-op; change the status to exit awaiting
    startTransition(async () => {
      const res = await setCallDecisionDue(call.id, value);
      if (res.error) setError(res.error);
    });
  }

  function commitAmounts() {
    setError(null);
    startTransition(async () => {
      const res = await setCallAmounts(
        call.id,
        Number.parseInt(contracted || "0", 10),
        Number.parseInt(collected || "0", 10)
      );
      if (res.error) setError(res.error);
    });
  }

  function onAmountKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
  }

  const dueUrgency = result === "awaiting_decision" && dueDate ? decisionUrgency(dueDate) : null;

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 align-top whitespace-nowrap text-muted-foreground">
        {DATE_FORMAT.format(new Date(call.scheduledAt))}
      </td>
      <td className="p-3 align-top">
        <p className="font-bold">{call.inviteeName ?? "—"}</p>
        {call.inviteeEmail && <p className="text-xs text-muted-foreground">{call.inviteeEmail}</p>}
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {call.source === "calendly" ? "Calendly" : call.source === "manual" ? "Manuel" : "iClosed"}
        </p>
      </td>
      <td className="p-3 align-top text-muted-foreground">{call.closer ?? "—"}</td>
      <td className="p-3 align-top">
        {cancelled ? (
          <span className="rounded-full bg-state-unknown-bg px-2 py-0.5 text-xs font-bold text-state-unknown">
            Annulé
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <select
              aria-label="Issue de l'appel"
              value={result ?? ""}
              onChange={(e) => chooseResult(e.target.value as Result | "")}
              className={`w-fit rounded-[var(--radius-control)] border px-2.5 py-1 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 ${
                result ? RESULT_TINT[result] : "border-border bg-background text-muted-foreground"
              }`}
            >
              <option value="" disabled>
                À traiter…
              </option>
              {RESULT_ORDER.map((value) => (
                <option key={value} value={value}>
                  {RESULT_LABEL[value]}
                </option>
              ))}
            </select>
            {result === "awaiting_decision" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Réponse attendue le"
                  value={dueDate}
                  onChange={(e) => commitDueDate(e.target.value)}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
                {dueUrgency ? (
                  <span className={`text-[10px] font-bold ${TONE_TEXT[dueUrgency.tone]}`}>{dueUrgency.label}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">réponse attendue ?</span>
                )}
              </div>
            )}
          </div>
        )}
        {!cancelled && result === null && isFuture && (
          <p className="mt-1 text-[10px] text-muted-foreground">à venir</p>
        )}
        {error && <p className="mt-1 text-xs text-state-critical">{error}</p>}
      </td>
      <td className="p-3 text-right align-top tabular-nums">
        {result === "closed" ? (
          <AmountInput value={contracted} onChange={setContracted} onCommit={commitAmounts} onKey={onAmountKey} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 text-right align-top tabular-nums">
        {result === "closed" ? (
          <AmountInput value={collected} onChange={setCollected} onCommit={commitAmounts} onKey={onAmountKey} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 text-right align-top">
        <button
          type="button"
          onClick={() => onOpenComments(call.id)}
          aria-label="Commentaires"
          className="inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          <MessageSquare className="size-3.5" />
          {call.commentCount > 0 && <span>{call.commentCount}</span>}
        </button>
      </td>
    </tr>
  );
}

function AmountInput({
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
