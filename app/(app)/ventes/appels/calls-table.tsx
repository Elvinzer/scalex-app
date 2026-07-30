"use client";

import { MessageSquare } from "lucide-react";
import { useState, useTransition, type KeyboardEvent } from "react";

import type { SalesCallRow } from "@/lib/iclosed/calls";

import { setCallAmounts, setCallResult } from "./actions";
import { CallDetailDrawer } from "./call-detail-drawer";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type Result = "no_show" | "not_closed" | "closed";

const OUTCOMES: { value: Result; label: string; active: string }[] = [
  { value: "no_show", label: "No-show", active: "border-state-caution bg-state-caution/15 text-state-caution" },
  { value: "not_closed", label: "Non closé", active: "border-state-unknown bg-state-unknown-bg text-state-unknown" },
  { value: "closed", label: "Closé", active: "border-state-healthy bg-state-healthy-bg text-state-healthy" },
];

function deriveResult(call: SalesCallRow): Result | null {
  if (call.attendance === "no_show") return "no_show";
  if (call.outcome === "closed") return "closed";
  if (call.outcome === "not_closed") return "not_closed";
  return null;
}

export function CallsTable({ calls }: { calls: SalesCallRow[] }) {
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const selectedCall = selectedCallId ? (calls.find((c) => c.id === selectedCallId) ?? null) : null;

  if (calls.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">Aucun appel sur cette période</p>
        <p className="mt-1 text-sm text-muted-foreground">Change de période, ou attends de nouvelles réservations.</p>
      </div>
    );
  }

  return (
    <>
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

function CallRow({ call, onOpenComments }: { call: SalesCallRow; onOpenComments: (callId: string) => void }) {
  const [result, setResult] = useState<Result | null>(deriveResult(call));
  const [contracted, setContracted] = useState(call.contracted != null ? String(call.contracted) : "");
  const [collected, setCollected] = useState(call.collected != null ? String(call.collected) : "");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const cancelled = call.attendance === "cancelled";
  const isFuture = new Date(call.scheduledAt).getTime() > Date.now();

  function choose(next: Result) {
    const value = next === result ? null : next; // click again to unset
    setResult(value);
    setError(null);
    if (value !== "closed") {
      setContracted("");
      setCollected("");
    }
    // Unsetting isn't a distinct server state — re-picking is the common path;
    // on unset we just leave it and let the next choice persist.
    if (value) {
      startTransition(async () => {
        const res = await setCallResult(call.id, value);
        if (res.error) setError(res.error);
      });
    }
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

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 align-top whitespace-nowrap text-muted-foreground">{DATE_FORMAT.format(new Date(call.scheduledAt))}</td>
      <td className="p-3 align-top">
        <p className="font-bold">{call.inviteeName ?? "—"}</p>
        {call.inviteeEmail && <p className="text-xs text-muted-foreground">{call.inviteeEmail}</p>}
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {call.source === "calendly" ? "Calendly" : "iClosed"}
        </p>
      </td>
      <td className="p-3 align-top text-muted-foreground">{call.closer ?? "—"}</td>
      <td className="p-3 align-top">
        {cancelled ? (
          <span className="rounded-full bg-state-unknown-bg px-2 py-0.5 text-xs font-bold text-state-unknown">Annulé</span>
        ) : (
          <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-border">
            {OUTCOMES.map((o, i) => {
              const selected = result === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => choose(o.value)}
                  className={`px-2.5 py-1 text-xs font-bold transition-colors ${i > 0 ? "border-l border-border" : ""} ${
                    selected ? o.active : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
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
