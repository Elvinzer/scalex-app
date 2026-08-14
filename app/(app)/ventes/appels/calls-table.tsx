"use client";

import { MessageSquare } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { SalesCallRow } from "@/lib/iclosed/calls";
import type { ActiveCloser } from "@/lib/closers/types";
import { CallContactActions } from "@/components/call-contact-actions";

import { CallDetailDrawer } from "./call-detail-drawer";
import { AmountInput, CallResultSelect, TONE_DOT, TONE_TEXT, decisionUrgency, useCallOutcome } from "./call-outcome";

export function CallsTable({
  calls,
  pendingDecisions,
  closers,
  initialCallId,
}: {
  calls: SalesCallRow[];
  pendingDecisions: SalesCallRow[];
  closers: ActiveCloser[];
  initialCallId: string | null;
}) {
  const t = useTranslations("app.calls");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [closerFilter, setCloserFilter] = useState("");
  const selectedCloserName = closers.find((closer) => closer.id === closerFilter)?.name ?? null;
  const visibleCalls = closerFilter
    ? calls.filter((call) => call.closerUserId === closerFilter || (call.closerUserId === null && call.closer === selectedCloserName))
    : calls;
  const visiblePendingDecisions = closerFilter
    ? pendingDecisions.filter((call) => call.closerUserId === closerFilter || (call.closerUserId === null && call.closer === selectedCloserName))
    : pendingDecisions;
  // A pending decision can sit outside the current period, so look it up across
  // both lists for the drawer.
  const selectedCall = selectedCallId
    ? (visibleCalls.find((c) => c.id === selectedCallId) ??
      visiblePendingDecisions.find((c) => c.id === selectedCallId) ??
      null)
    : null;

  useEffect(() => {
    if (!initialCallId) return;
    const exists = visibleCalls.some((call) => call.id === initialCallId) || visiblePendingDecisions.some((call) => call.id === initialCallId);
    if (exists) setSelectedCallId(initialCallId);
  }, [initialCallId, visibleCalls, visiblePendingDecisions]);

  return (
    <>
      <div className="flex flex-col gap-4">
        {closers.length > 0 && (
          <label className="flex w-full max-w-xs flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-muted-foreground">{t("filterCloser")}</span>
            <select
              value={closerFilter}
              onChange={(event) => setCloserFilter(event.target.value)}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            >
              <option value="">{t("allClosers")}</option>
              {closers.map((closer) => (
                <option key={closer.id} value={closer.id}>{closer.name}</option>
              ))}
            </select>
          </label>
        )}
        <PendingDecisions decisions={visiblePendingDecisions} onOpen={setSelectedCallId} initialCallId={initialCallId} />
        {visibleCalls.length === 0 ? (
          <div className="sticker-card-dashed p-6 text-center">
            <p className="text-sm font-bold">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyHelp")}
            </p>
          </div>
        ) : (
          <div className="sticker-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("date")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("invitee")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("closer")}</th>
                  <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("outcome")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("contracted")}</th>
                  <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("collected")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {visibleCalls.map((call) => (
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
  initialCallId,
}: {
  decisions: SalesCallRow[];
  onOpen: (id: string) => void;
  initialCallId: string | null;
}) {
  const t = useTranslations("app.calls");
  if (decisions.length === 0) return null;
  const sorted = [...decisions].sort((a, b) => {
    if (!a.decisionDueAt) return 1;
    if (!b.decisionDueAt) return -1;
    return a.decisionDueAt.localeCompare(b.decisionDueAt);
  });

  return (
    <div className="sticker-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{t("pendingDecisions")}</p>
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
              className={`flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 py-1.5 hover:bg-muted ${call.id === initialCallId ? "ring-2 ring-accent/30" : ""}`}
              data-revenue-target={call.id === initialCallId ? "true" : undefined}
            >
              <span className={`size-2 shrink-0 rounded-full ${urgency ? TONE_DOT[urgency.tone] : "bg-state-unknown"}`} />
              <span
                className={`w-32 shrink-0 text-xs font-bold ${urgency ? TONE_TEXT[urgency.tone] : "text-muted-foreground"}`}
              >
                {urgency ? (urgency.days < 0 ? t("lateBy", { days: -urgency.days }) : urgency.days === 0 ? t("today") : t("inDays", { days: urgency.days })) : t("dateToDefine")}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-bold">{call.inviteeName ?? "—"}</span>
                {call.inviteeEmail && (
                  <span className="ml-2 text-xs text-muted-foreground">{call.inviteeEmail}</span>
                )}
              </span>
              <CallContactActions
                phone={call.inviteePhone}
                name={call.inviteeName}
                eventType={call.eventType}
                compact
                className="shrink-0"
              />
              <button
                type="button"
                onClick={() => onOpen(call.id)}
                className="flex min-h-11 shrink-0 items-center rounded-[var(--radius-control)] px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
              >
                {t("view")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CallRow({ call, onOpenComments }: { call: SalesCallRow; onOpenComments: (callId: string) => void }) {
  const locale = useLocale();
  const t = useTranslations("app.calls");
  const {
    result,
    contracted,
    setContracted,
    collected,
    setCollected,
    dueDate,
    error,
    chooseResult,
    commitDueDate,
    commitAmounts,
    onAmountKey,
    dueUrgency,
  } = useCallOutcome(call);

  const cancelled = call.attendance === "cancelled";
  const isFuture = new Date(call.scheduledAt).getTime() > Date.now();

  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 align-top whitespace-nowrap text-muted-foreground">
        {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(call.scheduledAt))}
      </td>
      <td className="p-3 align-top">
        <p className="font-bold">{call.inviteeName ?? "—"}</p>
        {call.inviteeEmail && <p className="text-xs text-muted-foreground">{call.inviteeEmail}</p>}
        {call.inviteePhone && <p className="text-xs font-bold text-foreground">{call.inviteePhone}</p>}
        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          {t(`source.${call.source}`)}
        </p>
        <CallContactActions
          phone={call.inviteePhone}
          name={call.inviteeName}
          eventType={call.eventType}
          compact
          className="mt-2"
        />
        {call.source === "native" && (call.utmSource || call.utmCampaign || call.utmContent) && (
          <p className="mt-1 text-[10px] font-bold text-accent">
            {[call.utmSource, call.utmCampaign, call.utmContent].filter(Boolean).join(" · ")}
          </p>
        )}
      </td>
      <td className="p-3 align-top text-muted-foreground">{call.closer ?? "—"}</td>
      <td className="p-3 align-top">
        {cancelled ? (
          <span className="rounded-full bg-state-unknown-bg px-2 py-0.5 text-xs font-bold text-state-unknown">
            {t("cancelled")}
          </span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <CallResultSelect result={result} onChange={chooseResult} />
            {result === "awaiting_decision" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label={t("expectedResponseDate")}
                  value={dueDate}
                  onChange={(e) => commitDueDate(e.target.value)}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
                {dueUrgency ? (
                  <span className={`text-[10px] font-bold ${TONE_TEXT[dueUrgency.tone]}`}>
                    {dueUrgency.days < 0 ? t("lateBy", { days: -dueUrgency.days }) : dueUrgency.days === 0 ? t("today") : t("inDays", { days: dueUrgency.days })}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">{t("expectedResponse")}</span>
                )}
              </div>
            )}
          </div>
        )}
        {!cancelled && result === null && isFuture && (
          <p className="mt-1 text-[10px] text-muted-foreground">{t("upcoming")}</p>
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
          aria-label={t("comments")}
          className="inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-xs font-bold text-muted-foreground hover:bg-muted"
        >
          <MessageSquare className="size-3.5" />
          {call.commentCount > 0 && <span>{call.commentCount}</span>}
        </button>
      </td>
    </tr>
  );
}
