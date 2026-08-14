"use client";

import { Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CallContactActions } from "@/components/call-contact-actions";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { SalesCallRow } from "@/lib/iclosed/calls";

import { AmountInput, CallResultSelect, PaymentPlanControl, TONE_TEXT, useCallOutcome } from "./call-outcome";
import { addCallComment, deleteCallComment, getCallComments, type CallComment } from "./comment-actions";

export function CallDetailDrawer({
  call,
  open,
  onOpenChange,
}: {
  call: SalesCallRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("app.calls");
  const [comments, setComments] = useState<CallComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const outcome = useCallOutcome(call);

  const callId = call?.id ?? null;

  useEffect(() => {
    if (!open || !callId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getCallComments(callId).then((res) => {
      if (!active) return;
      if (res.error) setError(res.error);
      setComments(res.comments);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [open, callId]);

  async function reload() {
    if (!callId) return;
    const res = await getCallComments(callId);
    if (res.error) setError(res.error);
    else setComments(res.comments);
  }

  function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!callId) return;
    setError(null);
    const text = body;
    startTransition(async () => {
      const res = await addCallComment(callId, text);
      if (res.error) setError(res.error);
      else {
        setBody("");
        await reload();
      }
    });
  }

  function handleDelete(commentId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteCallComment(commentId);
      if (res.error) setError(res.error);
      else await reload();
    });
  }

  if (!call) return null;

  const cancelled = call.attendance === "cancelled";
  const isFuture = new Date(call.scheduledAt).getTime() > Date.now();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border p-5">
          <DrawerTitle className="text-lg font-bold">{call.inviteeName ?? "Appel"}</DrawerTitle>
          <DrawerClose asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t("close")}>
              ×
            </Button>
          </DrawerClose>
        </div>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {call.inviteeEmail && <span>{call.inviteeEmail}</span>}
            <span>{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(call.scheduledAt))}</span>
            {call.closer && <span>{t("closer")} : {call.closer}</span>}
            <span className="text-[10px] font-bold tracking-wide uppercase">
              {t(`source.${call.source}`)}
            </span>
            {call.inviteePhone ? (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <span className="font-bold text-foreground">{call.inviteePhone}</span>
                <CallContactActions phone={call.inviteePhone} name={call.inviteeName} eventType={call.eventType} />
              </div>
            ) : (
              <span>{t("phoneMissing")}</span>
            )}
            {call.source === "native" && (call.utmSource || call.utmMedium || call.utmCampaign || call.utmContent) && (
              <span className="text-accent">
                {t("attribution")} : {[call.utmSource, call.utmMedium, call.utmCampaign, call.utmContent].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-4">
            <p className="text-sm font-bold">{t("outcome")}</p>
            {cancelled ? (
              <span className="w-fit rounded-full bg-state-unknown-bg px-2 py-0.5 text-xs font-bold text-state-unknown">
                {t("cancelled")}
              </span>
            ) : (
              <>
                <CallResultSelect result={outcome.result} onChange={outcome.chooseResult} />
                {outcome.result === "awaiting_decision" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      aria-label={t("expectedResponseDate")}
                      value={outcome.dueDate}
                      onChange={(e) => outcome.commitDueDate(e.target.value)}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    />
                    {outcome.dueUrgency ? (
                      <span className={`text-[10px] font-bold ${TONE_TEXT[outcome.dueUrgency.tone]}`}>
                        {outcome.dueUrgency.days < 0 ? t("lateBy", { days: -outcome.dueUrgency.days }) : outcome.dueUrgency.days === 0 ? t("today") : t("inDays", { days: outcome.dueUrgency.days })}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{t("expectedResponse")}</span>
                    )}
                  </div>
                )}
                {outcome.result === "closed" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-5">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{t("contracted")}</span>
                        <AmountInput
                          value={outcome.contracted}
                          onChange={outcome.setContracted}
                          onCommit={outcome.commitAmounts}
                          onKey={outcome.onAmountKey}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{t("collected")}</span>
                        <AmountInput
                          value={outcome.collected}
                          onChange={outcome.setCollected}
                          onCommit={outcome.commitAmounts}
                          onKey={outcome.onAmountKey}
                        />
                      </div>
                    </div>
                    <PaymentPlanControl
                      paymentType={outcome.paymentType}
                      installmentCount={outcome.installmentCount}
                      onPaymentTypeChange={outcome.setPaymentType}
                      onInstallmentCountChange={outcome.setInstallmentCount}
                      onCommit={outcome.commitAmounts}
                    />
                  </div>
                )}
                {outcome.result === null && isFuture && (
                  <p className="text-xs text-muted-foreground">{t("upcomingNoOutcome")}</p>
                )}
              </>
            )}
            {outcome.error && <p className="text-xs text-state-critical">{outcome.error}</p>}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-bold">{t("comments")}</p>
              <CallContactActions
                phone={call.inviteePhone}
                name={call.inviteeName}
                eventType={call.eventType}
                compact
              />
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noComments")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {comments.map((c) => (
                  <li key={c.id} className="rounded-[var(--radius-control)] border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold">{c.authorName}</p>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(c.createdAt))}</span>
                        {c.isOwn && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            disabled={isPending}
                            aria-label={t("delete")}
                            className="text-muted-foreground hover:text-state-critical"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleAdd} className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("commentPlaceholder")}
              rows={3}
              className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
            {error && <p className="text-sm text-state-critical">{error}</p>}
            <Button type="submit" disabled={isPending || body.trim() === ""} className="self-end">
              {isPending ? t("saving") : t("add")}
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
