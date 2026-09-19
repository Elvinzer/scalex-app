"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CrmBookingAvailabilityView, CrmLeadDetails } from "@/lib/crm/types";

import { createInternalBookingAction, getBookingLinkAction, getInternalBookingSlotsAction, recordBookingLinkSentAction } from "./crm-actions";

type BookingLead = Pick<CrmLeadDetails, "id" | "displayName">;

async function copyToClipboard(value: string) {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) throw new Error("Clipboard copy failed");
}

export function CrmBookingActions({ lead, onBooked }: { lead: BookingLead; onBooked: (booking: { scheduledAt: string; timeZone: string; closerName: string }) => void }) {
  const t = useTranslations("crm.detail");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkRecorded, setLinkRecorded] = useState(false);
  const [availability, setAvailability] = useState<CrmBookingAvailabilityView | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);
  const [linkIdempotencyKey, setLinkIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [bookingIdempotencyKey, setBookingIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const isBusy = isPending || linkPending;

  const absoluteLink = link && typeof window !== "undefined" ? new URL(link, window.location.origin).toString() : link;
  const selectedSlot = useMemo(() => {
    const [startAt, closerUserId] = selectedValue.split("|");
    return availability?.slots.find((slot) => slot.startAt === startAt && slot.closerUserId === closerUserId) ?? null;
  }, [availability, selectedValue]);

  useEffect(() => {
    if (!linkCopied) return;

    const timeoutId = window.setTimeout(() => setLinkCopied(false), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [linkCopied]);

  async function copyBookingLink() {
    if (linkPending) return;
    setLinkStatus(null);
    setLinkCopied(false);
    setLinkPending(true);
    try {
      let href = link;
      if (!href) {
        const result = await getBookingLinkAction();
        if (result.error) {
          setLinkStatus(result.error);
          return;
        }
        if (!result.href) {
          setLinkStatus(t("bookingNoLink"));
          return;
        }
        href = result.href;
      }

      const resolved = new URL(href, window.location.origin).toString();
      try {
        await copyToClipboard(resolved);
      } catch {
        setLinkStatus(t("bookingCopyError"));
        return;
      }
      setLink(href);
      setLinkCopied(true);

      if (!linkRecorded) {
        const recorded = await recordBookingLinkSentAction({ leadId: lead.id, idempotencyKey: linkIdempotencyKey });
        if (recorded.error) {
          setLinkStatus(recorded.error);
          return;
        }
        setLinkRecorded(true);
        setLinkIdempotencyKey(globalThis.crypto.randomUUID());
      }

      setLinkStatus(t("bookingLinkCopied"));
    } catch {
      setLinkStatus(t("bookingRequestError"));
    } finally {
      setLinkPending(false);
    }
  }

  function openInternalBooking() {
    setBookingError(null);
    setBookingStatus(null);
    startTransition(async () => {
      try {
        const result = await getInternalBookingSlotsAction({ leadId: lead.id });
        if (result.error) {
          setBookingError(result.error);
          return;
        }
        if (!result.availability) {
          setBookingError(t("bookingNoSlots"));
          return;
        }
        setAvailability(result.availability);
        const firstSlot = result.availability.slots[0];
        setSelectedValue(firstSlot ? `${firstSlot.startAt}|${firstSlot.closerUserId}` : "");
        setBookingOpen(true);
      } catch {
        setBookingError(t("bookingRequestError"));
      }
    });
  }

  function confirmInternalBooking() {
    if (!selectedSlot) return;
    setBookingError(null);
    startTransition(async () => {
      try {
        const result = await createInternalBookingAction({ leadId: lead.id, startAt: selectedSlot.startAt, closerUserId: selectedSlot.closerUserId, idempotencyKey: bookingIdempotencyKey });
        if (result.error || !result.call) {
          setBookingError(result.error ?? t("bookingSaveError"));
          return;
        }
        setBookingOpen(false);
        setBookingStatus(t("bookingSaved"));
        setBookingIdempotencyKey(globalThis.crypto.randomUUID());
        onBooked(result.call);
      } catch {
        setBookingError(t("bookingRequestError"));
      }
    });
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: availability?.timeZone });

  return (
    <section className="rounded-[var(--radius-control)] border border-border bg-muted/20 p-3" aria-labelledby="crm-booking-actions-title">
      <h2 id="crm-booking-actions-title" className="text-sm font-bold">{t("bookingTitle")}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)]">
        <div className="rounded-[var(--radius-control)] border border-border bg-card p-3" aria-busy={linkPending}>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground" aria-hidden="true">
              <Link2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("bookingLinkLabel")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("bookingLinkCopyHint")}</p>
            </div>
          </div>

          {absoluteLink ? (
            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-muted/20 p-2">
              <a href={absoluteLink} target="_blank" rel="noreferrer" title={absoluteLink} className="min-w-0 flex-1 truncate text-xs font-bold text-accent-text underline underline-offset-2">{absoluteLink}</a>
              <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3" disabled={isBusy} onClick={() => void copyBookingLink()}>
                {linkCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {linkPending ? t("bookingLinkCopying") : linkCopied ? t("bookingLinkCopied") : t("copyBookingLink")}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" disabled={isBusy} onClick={() => void copyBookingLink()}>
              <Copy aria-hidden="true" />
              {linkPending ? t("bookingLinkCopying") : t("copyBookingLink")}
            </Button>
          )}

          {linkStatus && <p className="mt-2 text-sm font-bold text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{linkStatus}</p>}
        </div>

        <Button type="button" variant="outline" className="min-h-11 w-full self-start" disabled={isBusy} onClick={openInternalBooking}>{t("bookForProspect")}</Button>
      </div>
      {bookingStatus && <p className="mt-2 text-sm font-bold text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{bookingStatus}</p>}
      {bookingError && <p className="mt-2 text-sm font-bold text-state-critical" role="alert">{bookingError}</p>}

      <Dialog open={bookingOpen} onOpenChange={(open) => { if (!isPending) setBookingOpen(open); }}>
        <DialogContent className="max-h-[min(86vh,720px)] overflow-y-auto">
          <DialogTitle>{t("bookForProspectTitle", { name: lead.displayName })}</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">{availability ? t("bookingAvailabilityHelp", { timeZone: availability.timeZone }) : t("bookingLoading")}</p>
          {availability && availability.slots.length === 0 && <p className="mt-4 rounded-[var(--radius-control)] bg-state-caution/10 p-3 text-sm font-bold text-state-caution">{t("bookingNoSlots")}</p>}
          {availability && availability.slots.length > 0 && <label className="mt-4 flex flex-col gap-1.5 text-sm font-bold">{t("bookingSlot")}
            <select value={selectedValue} onChange={(event) => setSelectedValue(event.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">
              {availability.slots.map((slot) => <option key={`${slot.startAt}-${slot.closerUserId}`} value={`${slot.startAt}|${slot.closerUserId}`}>{dateFormatter.format(new Date(slot.startAt))} · {slot.closerName}</option>)}
            </select>
          </label>}
          {bookingError && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{bookingError}</p>}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={isBusy} onClick={() => setBookingOpen(false)}>{t("bookingCancel")}</Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={isBusy || !selectedSlot} onClick={confirmInternalBooking}>{isPending ? t("bookingSaving") : t("bookingConfirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
