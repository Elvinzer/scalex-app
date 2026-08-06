"use client";

import { Ban, CalendarClock, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { phoneHref, whatsappHref } from "@/lib/native-booking/phone-links";

import { cancelNativeBookingAction, rescheduleNativeBookingAction, retryNativeBookingCalendarSyncAction } from "./actions";

type BookingView = {
  id: string;
  eventId: string;
  eventName: string;
  firstName: string;
  lastName: string;
  phone: string;
  closerName: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  status: "confirmed" | "sync_failed";
  syncError: string | null;
};

function formatBookingDate(startAt: string, endAt: string, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("fr-FR", { timeZone, dateStyle: "medium", timeStyle: "short" });
  return `${formatter.format(new Date(startAt))} – ${new Intl.DateTimeFormat("fr-FR", { timeZone, timeStyle: "short" }).format(new Date(endAt))}`;
}

export function UpcomingBookingsPanel({ bookings }: { bookings: BookingView[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<BookingView | null>(null);
  const [hiddenBookingIds, setHiddenBookingIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setHiddenBookingIds((current) => {
      const next = new Set(Array.from(current).filter((id) => bookings.some((booking) => booking.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [bookings]);

  function run(action: () => Promise<{ error: string | null; warning?: boolean }>, success: string, onSuccess?: () => void) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setMessage(result.warning ? `${success} Le calendrier devra être vérifié.` : success);
        onSuccess?.();
        router.refresh();
      }
    });
  }

  function confirmCancel() {
    if (!pendingCancel) return;
    const booking = pendingCancel;
    run(
      () => cancelNativeBookingAction({ bookingId: booking.id }),
      "Rendez-vous annulé.",
      () => {
        setHiddenBookingIds((current) => new Set(current).add(booking.id));
        setPendingCancel(null);
      },
    );
  }

  const visibleBookings = useMemo(() => bookings.filter((booking) => !hiddenBookingIds.has(booking.id)), [bookings, hiddenBookingIds]);

  return (
    <>
      <section className="flex flex-col gap-3" aria-labelledby="upcoming-bookings-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 id="upcoming-bookings-title" className="text-lg font-bold">Rendez-vous à venir</h3>
            {visibleBookings.length > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{visibleBookings.length}</span>}
          </div>
          <p className="text-sm text-muted-foreground">Annule ou déplace un appel sans perdre l&apos;historique d&apos;attribution.</p>
        </div>
      </div>

      {error && <p className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      {message && <p className="rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-sm font-bold text-state-healthy" role="status">{message}</p>}

      {visibleBookings.length === 0 ? (
        <div className="sticker-card-dashed flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <CalendarClock className="size-5 shrink-0" /> Aucun rendez-vous futur à gérer.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibleBookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} disabled={isPending} run={run} onRequestCancel={() => { setError(null); setPendingCancel(booking); }} />
          ))}
        </div>
      )}
      </section>

      <ConfirmationDialog
        open={pendingCancel !== null}
        title="Annuler ce rendez-vous ?"
        description="Le créneau sera libéré et le prospect recevra un email pour l’informer de l’annulation."
        detail={pendingCancel && <div className="flex flex-col gap-1"><p className="font-bold">{pendingCancel.firstName} {pendingCancel.lastName}</p><p className="text-muted-foreground">{pendingCancel.eventName} · {formatBookingDate(pendingCancel.startAt, pendingCancel.endAt, pendingCancel.timeZone)}</p></div>}
        confirmLabel="Annuler le rendez-vous"
        cancelLabel="Garder le rendez-vous"
        pending={isPending}
        error={error}
        onCancel={() => { if (!isPending) { setPendingCancel(null); setError(null); } }}
        onConfirm={confirmCancel}
      />
    </>
  );
}

function BookingCard({
  booking,
  disabled,
  run,
  onRequestCancel,
}: {
  booking: BookingView;
  disabled: boolean;
  run: (action: () => Promise<{ error: string | null; warning?: boolean }>, success: string) => void;
  onRequestCancel: () => void;
}) {
  const [nextStartAt, setNextStartAt] = useState("");
  const call = phoneHref(booking.phone);
  const whatsapp = whatsappHref(booking.phone, `Bonjour ${booking.firstName}, je reviens vers toi au sujet de ${booking.eventName}.`);
  return (
    <article className="sticker-card flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{booking.firstName} {booking.lastName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{booking.eventName} · {booking.closerName}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${booking.status === "sync_failed" ? "border-state-caution/30 bg-state-caution/10 text-state-caution" : "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"}`}>
          {booking.status === "sync_failed" ? "Calendrier à vérifier" : "Confirmé"}
        </span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Horaire</dt>
          <dd className="mt-1 font-bold">{formatBookingDate(booking.startAt, booking.endAt, booking.timeZone)}</dd>
          <dd className="text-xs text-muted-foreground">{booking.timeZone}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Téléphone</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            <span className="flex min-h-11 items-center font-bold">{booking.phone}</span>
            {call && <a href={call} aria-label={`Appeler ${booking.firstName} ${booking.lastName}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-xs font-bold hover:bg-muted"><Phone className="size-3.5" /> Appeler</a>}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] bg-state-healthy-bg px-3 text-xs font-bold text-state-healthy hover:underline"><MessageCircle className="size-3.5" /> WhatsApp</a>}
          </dd>
        </div>
      </dl>
      {booking.syncError && <p className="rounded-[var(--radius-control)] bg-state-caution/10 px-3 py-2 text-xs font-bold text-state-caution">{booking.syncError}</p>}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <label className="flex flex-col gap-1.5 text-xs font-bold">
          Nouvel horaire <span className="font-normal text-muted-foreground">saisi dans le fuseau de ton navigateur</span>
          <input type="datetime-local" value={nextStartAt} onChange={(event) => setNextStartAt(event.target.value)} disabled={disabled} className="booking-admin-input text-sm" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled || !nextStartAt}
            onClick={() => run(() => rescheduleNativeBookingAction({ bookingId: booking.id, startAt: new Date(nextStartAt).toISOString() }), "Rendez-vous déplacé.")}
            variant="outline"
            size="lg"
            className="min-h-11"
          >
            <CalendarClock className="size-4" /> Déplacer
          </Button>
          {booking.status === "sync_failed" && (
            <Button
              type="button"
              disabled={disabled}
              onClick={() => run(() => retryNativeBookingCalendarSyncAction({ bookingId: booking.id }), "Synchronisation relancée.")}
              variant="outline"
              size="lg"
              className="min-h-11"
            >
              <RefreshCw className="size-4" /> Réessayer
            </Button>
          )}
          <Button
            type="button"
            disabled={disabled}
            onClick={onRequestCancel}
            variant="outline"
            size="lg"
            className="min-h-11 text-muted-foreground"
          >
            <Ban className="size-4" /> Annuler
          </Button>
        </div>
      </div>
    </article>
  );
}
