"use client";

import { ExternalLink, Loader2, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { CallContactActions } from "@/components/call-contact-actions";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { SalesCallRow } from "@/lib/iclosed/calls";

import { AmountInput, CallResultSelect, PaymentPlanControl, TONE_TEXT, useCallOutcome } from "./call-outcome";
import { analyzeCallWithFalco, saveCallRecording } from "./call-analysis-actions";
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
  const router = useRouter();
  const [comments, setComments] = useState<CallComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");
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

  useEffect(() => {
    if (!call) return;
    setRecordingUrl(call.closingVideo?.url ?? "");
    setTranscript(call.closingVideo?.transcript ?? "");
    setNotes(call.closingVideo?.notes ?? "");
  }, [call]);

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

  function handleSaveRecording() {
    if (!callId) return;
    setError(null);
    startTransition(async () => {
      const result = await saveCallRecording({ callId, url: recordingUrl, transcript, notes });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAnalyze() {
    if (!callId) return;
    setError(null);
    startTransition(async () => {
      const result = await analyzeCallWithFalco(callId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!call) return null;

  const cancelled = call.attendance === "cancelled";
  const isFuture = new Date(call.scheduledAt).getTime() > Date.now();

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex items-center justify-between border-b border-border p-5">
          <DrawerTitle className="text-lg font-bold">{call.inviteeName ?? t("callFallback")}</DrawerTitle>
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

          <section className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border p-4" aria-labelledby="call-recording-title">
            <div>
              <p id="call-recording-title" className="text-sm font-bold">{t("recordingTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("recordingHelp")}</p>
            </div>
            {call.closingVideo?.url ? (
              <a href={call.closingVideo.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-bold text-accent-2-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
                <ExternalLink className="size-4" aria-hidden="true" />
                {t("openRecording")}
              </a>
            ) : null}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("recordingUrl")}</span>
              <input
                type="url"
                value={recordingUrl}
                onChange={(event) => setRecordingUrl(event.target.value)}
                placeholder={t("recordingUrlPlaceholder")}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("transcript")}</span>
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                rows={6}
                placeholder={t("transcriptPlaceholder")}
                className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("callNotes")}</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder={t("callNotesPlaceholder")}
                className="resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={handleSaveRecording} disabled={isPending}>
                {isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {isPending ? t("saving") : t("saveRecording")}
              </Button>
              <Button type="button" variant="accent2" onClick={handleAnalyze} disabled={isPending || (!transcript.trim() && !notes.trim())}>
                {isPending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                {isPending ? t("analysisPending") : t("analyzeWithFalco")}
              </Button>
            </div>
            {call.closingVideo?.falcoAnalysis ? (
              (() => {
                // Defensive against legacy/partial jsonb rows: falcoAnalysis is
                // a `$type`-cast column, so an older record can lack the array
                // fields the current schema guarantees. Fall back to [] rather
                // than let `.length`/`.map` throw and take the whole app down.
                const fa = call.closingVideo.falcoAnalysis;
                const strengths = fa.strengths ?? [];
                const improvements = fa.improvements ?? [];
                const roadmap = fa.roadmap ?? [];
                return (
                  <div className="flex flex-col gap-4 border-t border-border pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-bold">{t("analysisTitle")}</p>
                      <span className="rounded-full bg-accent-2-soft px-3 py-1 text-sm font-bold text-accent-2-text">{t("score", { score: fa.score })}</span>
                    </div>
                    {fa.summary && <p className="text-sm text-muted-foreground">{fa.summary}</p>}
                    {strengths.length > 0 ? (
                      <div>
                        <p className="text-xs font-bold text-state-healthy">{t("strengths")}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                    ) : null}
                    {improvements.length > 0 ? (
                      <div>
                        <p className="text-xs font-bold text-accent-2-text">{t("improvements")}</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{improvements.map((item) => <li key={item}>{item}</li>)}</ul>
                      </div>
                    ) : null}
                    {roadmap.length > 0 ? (
                      <div className="rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/50 p-3">
                        <p className="text-xs font-bold text-accent-2-text">{t("roadmapIdeas")}</p>
                        <ul className="mt-2 space-y-2 text-sm">
                          {roadmap.map((item) => <li key={item.id}><p className="font-bold">{item.title}</p><p className="mt-0.5 text-muted-foreground">{item.description}</p></li>)}
                        </ul>
                        <Link href="/roadmap" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-accent-2-text underline-offset-4 hover:underline">{t("openRoadmap")} <ExternalLink className="size-3.5" aria-hidden="true" /></Link>
                      </div>
                    ) : null}
                  </div>
                );
              })()
            ) : null}
          </section>

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
