"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CrmBookingAvailabilityView, CrmLeadDetails } from "@/lib/crm/types";

import { createInternalBookingAction, getBookingLinkAction, getInternalBookingSlotsAction, recordBookingLinkSentAction } from "./crm-actions";

type BookingLead = Pick<CrmLeadDetails, "id" | "displayName">;

export function CrmBookingActions({ lead, onBooked }: { lead: BookingLead; onBooked: (booking: { scheduledAt: string; timeZone: string; closerName: string }) => void }) {
  const t = useTranslations("crm.detail");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
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

  async function sendLink() {
    if (linkPending) return;
    setStatus(null);
    setLinkPending(true);
    try {
      const result = await getBookingLinkAction();
      if (result.error) {
        setStatus(result.error);
        return;
      }
      if (!result.href) {
        setStatus(t("bookingNoLink"));
        return;
      }
      const resolved = typeof window === "undefined" ? result.href : new URL(result.href, window.location.origin).toString();
      if (typeof navigator.share === "function") await navigator.share({ text: t("bookingShareText", { name: lead.displayName }), url: resolved });
      else await navigator.clipboard.writeText(resolved);
      const recorded = await recordBookingLinkSentAction({ leadId: lead.id, idempotencyKey: linkIdempotencyKey });
      setStatus(recorded.error ?? (typeof navigator.share === "function" ? t("bookingLinkShared") : t("bookingLinkCopied")));
      if (recorded.error) return;
      setLink(result.href);
      setLinkIdempotencyKey(globalThis.crypto.randomUUID());
    } catch (error) {
      setStatus(error instanceof Error && error.name === "AbortError" ? t("bookingShareCancelled") : t("bookingRequestError"));
    } finally {
      setLinkPending(false);
    }
  }

  function openInternalBooking() {
    setBookingError(null);
    setStatus(null);
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
        setStatus(t("bookingSaved"));
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
      <h3 id="crm-booking-actions-title" className="text-sm font-bold">{t("bookingTitle")}</h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" className="min-h-11" disabled={isBusy} onClick={() => void sendLink()}>{linkPending ? t("bookingLinkSending") : t("sendBookingLink")}</Button>
        <Button type="button" variant="outline" className="min-h-11" disabled={isBusy} onClick={openInternalBooking}>{t("bookForProspect")}</Button>
      </div>
      {absoluteLink && <a href={absoluteLink} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs font-bold text-accent-text underline underline-offset-2">{absoluteLink}</a>}
      {status && <p className="mt-2 text-sm font-bold text-muted-foreground" role="status">{status}</p>}
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
