"use client";

import { LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

type PublicEvent = {
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  timeZone: string;
  meetingLabel: string;
  publicHeading: string;
  publicDescription: string;
  confirmationTitle: string;
  confirmationMessage: string;
  bookingInstructions: string;
};

type Slot = { startAt: string; endAt: string };
type Contact = { firstName: string; lastName: string; phone: string };

const EMPTY_CONTACT: Contact = { firstName: "", lastName: "", phone: "" };

function formatSlot(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(dateString));
}

function formatSlotDay(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(dateString));
}

function slotDayKey(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateString));
}

function getUtmFromUrl(): Record<string, string> {
  const entries = Array.from(new URLSearchParams(window.location.search).entries()).filter(([key, value]) => key.startsWith("utm_") && value.trim());
  return Object.fromEntries(entries);
}

export function PublicBookingPage({ event }: { event: PublicEvent }) {
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [guestTimeZone, setGuestTimeZone] = useState("Europe/Paris");
  const [displayTimeZone, setDisplayTimeZone] = useState(event.timeZone);
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [linkId, setLinkId] = useState<string | null>(null);
  const [landingPage, setLandingPage] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [confirmation, setConfirmation] = useState<null | { startAt: string; endAt: string; closerName: string; meetingUrl: string | null; cancellationToken: string | null; rescheduleToken: string | null; calendarSyncWarning?: boolean }>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [captureStatus, setCaptureStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, setIsPending] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [manageSlots, setManageSlots] = useState<Slot[]>([]);
  const [manageSlot, setManageSlot] = useState<Slot | null>(null);
  const [manageStatus, setManageStatus] = useState<"active" | "cancelled">("active");
  const [manageMessage, setManageMessage] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [bookingKey, setBookingKey] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const leadSessionKeyRef = useRef<string | null>(null);
  const leadIdRef = useRef<string | null>(null);
  const latestContactRef = useRef<Contact>(EMPTY_CONTACT);
  const captureTimerRef = useRef<number | null>(null);
  const queuedContactRef = useRef<Contact | null>(null);
  const captureLoopRef = useRef<Promise<void> | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      setGuestTimeZone(detected);
      setDisplayTimeZone(detected);
    }
    setUtm(getUtmFromUrl());
    setLinkId(new URLSearchParams(window.location.search).get("link") ?? new URLSearchParams(window.location.search).get("link_id"));
    setLandingPage(window.location.href);
    setReferrer(document.referrer || null);
    const storageKey = `native-booking-lead:${event.slug}`;
    const existingSessionKey = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, existingSessionKey);
    leadSessionKeyRef.current = existingSessionKey;

    return () => {
      if (captureTimerRef.current) window.clearTimeout(captureTimerRef.current);
    };
  }, [event.slug]);

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, { label: string; slots: Slot[] }>();
    for (const slot of slots) {
      const key = slotDayKey(slot.startAt, displayTimeZone);
      const group = groups.get(key) ?? { label: formatSlotDay(slot.startAt, displayTimeZone), slots: [] };
      group.slots.push(slot);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  }, [displayTimeZone, slots]);

  function updateContact(field: keyof Contact, value: string) {
    const nextContact = { ...contact, [field]: value };
    setContact(nextContact);
    latestContactRef.current = nextContact;
    setFieldErrors((current) => ({ ...current, [field]: [] }));
    setError(null);
    scheduleLeadCapture(nextContact);
  }

  function hasContactValue(value: Contact) {
    return Object.values(value).some((field) => field.trim().length > 0);
  }

  function ensureLeadSessionKey() {
    if (!leadSessionKeyRef.current) {
      const storageKey = `native-booking-lead:${event.slug}`;
      leadSessionKeyRef.current = window.sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, leadSessionKeyRef.current);
    }
    return leadSessionKeyRef.current;
  }

  function leadMetadata() {
    const params = new URLSearchParams(window.location.search);
    return {
      leadSessionKey: ensureLeadSessionKey(),
      landingPage: window.location.href,
      referrer: document.referrer || null,
      linkId: params.get("link") ?? params.get("link_id"),
      utm: { ...utm, ...getUtmFromUrl() },
    };
  }

  async function sendLeadCapture(snapshot: Contact) {
    if (!hasContactValue(snapshot)) return;
    setCaptureStatus("saving");
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "capture", ...snapshot, guestTimeZone, ...leadMetadata() }),
      });
      const payload = await response.json();
      if (response.ok && payload.leadId) {
        leadIdRef.current = payload.leadId;
        setLeadId(payload.leadId);
        setCaptureStatus("saved");
      } else {
        setCaptureStatus("idle");
      }
    } catch {
      // Auto-capture is deliberately non-blocking; the unlock request retries
      // the complete contact before revealing the availability.
      setCaptureStatus("idle");
    }
  }

  function queueLeadCapture(snapshot: Contact): Promise<void> {
    if (!hasContactValue(snapshot)) return Promise.resolve();
    queuedContactRef.current = snapshot;
    if (captureLoopRef.current) return captureLoopRef.current;

    const loop = (async () => {
      while (queuedContactRef.current) {
        const nextContact = queuedContactRef.current;
        queuedContactRef.current = null;
        await sendLeadCapture(nextContact);
      }
    })();
    captureLoopRef.current = loop;
    void loop.finally(() => {
      if (captureLoopRef.current === loop) captureLoopRef.current = null;
    });
    return loop;
  }

  function scheduleLeadCapture(snapshot: Contact) {
    if (captureTimerRef.current) window.clearTimeout(captureTimerRef.current);
    if (!hasContactValue(snapshot)) return;
    captureTimerRef.current = window.setTimeout(() => {
      captureTimerRef.current = null;
      void queueLeadCapture(latestContactRef.current);
    }, 450);
  }

  function captureContactNow() {
    if (captureTimerRef.current) {
      window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    void queueLeadCapture(latestContactRef.current);
  }

  async function unlockAvailability(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsPending(true);
    try {
      if (captureTimerRef.current) {
        window.clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
      await queueLeadCapture(contact);
      const metadata = leadMetadata();
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "unlock", ...contact, guestTimeZone, ...metadata }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Vérifie les informations saisies.");
        setFieldErrors(payload.fieldErrors ?? {});
        return;
      }
      setSlots(payload.slots ?? []);
      leadIdRef.current = payload.leadId ?? null;
      setLeadId(payload.leadId ?? null);
      setUnlocked(true);
      setDisplayTimeZone(guestTimeZone);
      window.setTimeout(() => calendarRef.current?.focus(), 80);
    } catch {
      setError("Impossible de charger les créneaux. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  async function touchLead(lastStep: "slot_selected" | "booking_failed", slot: Slot | null) {
    const currentLeadId = leadIdRef.current ?? leadId;
    if (!currentLeadId) return;
    try {
      await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "touch",
          ...contact,
          guestTimeZone,
          leadId: currentLeadId,
          lastStep,
          startAt: slot?.startAt ?? null,
        }),
      });
    } catch {
      // The booking journey must remain usable if a non-critical lead touch fails.
    }
  }

  async function holdSlot(slot: Slot) {
    setError(null);
    setSelectedSlot(slot);
    setHoldExpiresAt(null);
    setIsHolding(true);
    const idempotencyKey = bookingKey || crypto.randomUUID();
    setBookingKey(idempotencyKey);
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "hold",
          ...contact,
          guestTimeZone,
          startAt: slot.startAt,
          idempotencyKey,
          leadId: leadIdRef.current ?? leadId,
          utm,
          landingPage,
          referrer,
          linkId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.hold) {
        setSelectedSlot(null);
        setError(payload.error ?? "Ce créneau n’est plus disponible.");
        if (payload.code === "slot_unavailable") setSlots((current) => current.filter((currentSlot) => currentSlot.startAt !== slot.startAt));
        return;
      }
      setHoldExpiresAt(payload.hold.expiresAt);
      void touchLead("slot_selected", slot);
    } catch {
      setSelectedSlot(null);
      setError("Impossible de réserver temporairement ce créneau. Réessaie.");
    } finally {
      setIsHolding(false);
    }
  }

  async function confirmBooking() {
    if (!selectedSlot) return;
    const idempotencyKey = bookingKey || crypto.randomUUID();
    setBookingKey(idempotencyKey);
    setError(null);
    setIsPending(true);
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "book",
          ...contact,
          guestTimeZone,
          startAt: selectedSlot.startAt,
          idempotencyKey,
          leadId: leadIdRef.current ?? leadId,
          utm,
          landingPage,
          referrer,
          linkId,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Ce créneau n’est plus disponible.");
        void touchLead("booking_failed", selectedSlot);
        if (payload.code === "slot_unavailable") setSlots((current) => current.filter((slot) => slot.startAt !== selectedSlot.startAt));
        return;
      }
      setConfirmation(payload.booking);
    } catch {
      setError("La réservation n’a pas pu être confirmée. Réessaie.");
    } finally {
      setIsPending(false);
    }
  }

  async function loadManageSlots() {
    if (!confirmation?.rescheduleToken) return;
    setManageError(null);
    setManageMessage(null);
    setIsManaging(true);
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reschedule-slots", token: confirmation.rescheduleToken }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setManageError(payload.error ?? "Les autres créneaux ne sont pas disponibles.");
        return;
      }
      setManageSlots(payload.slots ?? []);
    } catch {
      setManageError("Impossible de charger les autres créneaux.");
    } finally {
      setIsManaging(false);
    }
  }

  async function cancelConfirmedBooking() {
    if (!confirmation?.cancellationToken) return;
    setManageError(null);
    setManageMessage(null);
    setIsManaging(true);
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "cancel", token: confirmation.cancellationToken }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setManageError(payload.error ?? "Le rendez-vous n’a pas pu être annulé.");
        return;
      }
      setManageStatus("cancelled");
      setManageSlots([]);
      setManageSlot(null);
      setManageMessage(payload.calendarSyncWarning ? "Rendez-vous annulé. Le calendrier du closer doit être vérifié." : "Rendez-vous annulé. Le créneau est de nouveau disponible.");
    } catch {
      setManageError("Le rendez-vous n’a pas pu être annulé.");
    } finally {
      setIsManaging(false);
    }
  }

  async function rescheduleConfirmedBooking() {
    if (!confirmation?.rescheduleToken || !manageSlot) return;
    setManageError(null);
    setManageMessage(null);
    setIsManaging(true);
    try {
      const response = await fetch(`/api/public/booking/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "reschedule", token: confirmation.rescheduleToken, startAt: manageSlot.startAt }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setManageError(payload.error ?? "Ce créneau n’est plus disponible.");
        if (payload.code === "slot_unavailable") setManageSlots((current) => current.filter((slot) => slot.startAt !== manageSlot.startAt));
        return;
      }
      setConfirmation((current) => current ? { ...current, startAt: payload.booking.startAt, endAt: payload.booking.endAt, closerName: payload.booking.closerName, calendarSyncWarning: payload.booking.calendarSyncWarning } : current);
      setManageSlots([]);
      setManageSlot(null);
      setManageMessage(payload.booking.calendarSyncWarning ? "Rendez-vous déplacé. Le calendrier du closer doit être vérifié." : "Rendez-vous déplacé avec succès.");
    } catch {
      setManageError("Le rendez-vous n’a pas pu être déplacé.");
    } finally {
      setIsManaging(false);
    }
  }

  if (confirmation) {
    return (
      <main className="public-booking-page min-h-screen bg-canvas px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="sticker-card flex flex-col items-center gap-4 p-8 text-center sm:p-12">
            <div className="flex size-14 items-center justify-center rounded-full bg-state-healthy-bg text-state-healthy">
              <ShieldCheck className="size-7" />
            </div>
            <div>
                <p className={`text-sm font-bold ${confirmation.calendarSyncWarning ? "text-state-caution" : "text-state-healthy"}`}>
                {confirmation.calendarSyncWarning ? "Réservation enregistrée" : event.confirmationTitle}
              </p>
              <h1 className="mt-2 text-3xl font-bold">C&apos;est réservé, {contact.firstName}.</h1>
              <p className="mt-2 text-muted-foreground">{event.confirmationMessage}</p>
            </div>
            <div className="mt-3 w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-muted/50 p-5 text-left">
              <p className="font-bold">{formatSlotDay(confirmation.startAt, displayTimeZone)}</p>
              <p className="mt-1 text-xl font-bold">{formatSlot(confirmation.startAt, displayTimeZone)} – {formatSlot(confirmation.endAt, displayTimeZone)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{event.meetingLabel} · {displayTimeZone}</p>
              <p className="mt-1 text-sm font-bold">Avec {confirmation.closerName}</p>
              {confirmation.meetingUrl && <a className="mt-3 inline-block text-sm font-bold text-accent underline" href={confirmation.meetingUrl}>Rejoindre le rendez-vous</a>}
              {event.bookingInstructions && <p className="mt-3 whitespace-pre-line rounded-[var(--radius-control)] bg-background/70 px-3 py-2 text-sm text-muted-foreground">{event.bookingInstructions}</p>}
              {confirmation.calendarSyncWarning && <p className="mt-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 px-3 py-2 text-xs font-bold text-state-caution">Ton rendez-vous est bien réservé, mais l&apos;agenda du closer doit être reconnecté.</p>}
            </div>
            {manageStatus === "cancelled" ? (
              <p className="w-full max-w-lg rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-4 py-3 text-sm font-bold text-state-healthy" role="status">
                {manageMessage ?? "Ce rendez-vous est annulé."}
              </p>
            ) : (confirmation.cancellationToken || confirmation.rescheduleToken) ? (
              <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-background/70 p-4 text-left">
                <p className="text-sm font-bold">Gérer ce rendez-vous</p>
                <p className="mt-1 text-xs text-muted-foreground">Tu peux annuler ou choisir un autre créneau. Aucun email n&apos;est nécessaire.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {confirmation.rescheduleToken && <button type="button" disabled={isManaging} onClick={() => void loadManageSlots()} className="rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">{isManaging && manageSlots.length === 0 ? "Chargement…" : "Choisir un autre créneau"}</button>}
                  {confirmation.cancellationToken && <button type="button" disabled={isManaging} onClick={() => { if (window.confirm("Annuler ce rendez-vous ?")) void cancelConfirmedBooking(); }} className="rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Annuler le rendez-vous</button>}
                </div>
                {manageSlots.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-bold text-muted-foreground">Créneaux dans {displayTimeZone}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {manageSlots.map((slot) => <button key={slot.startAt} type="button" disabled={isManaging} onClick={() => setManageSlot(slot)} className={`min-h-10 rounded-[var(--radius-control)] border px-2 py-1.5 text-xs font-bold ${manageSlot?.startAt === slot.startAt ? "border-accent bg-accent text-white" : "border-border hover:border-accent"}`}>{formatSlot(slot.startAt, displayTimeZone)}</button>)}
                    </div>
                    <button type="button" disabled={!manageSlot || isManaging} onClick={() => void rescheduleConfirmedBooking()} className="public-booking-primary mt-3">{isManaging ? "Déplacement…" : "Confirmer le nouveau créneau"}</button>
                  </div>
                )}
                {manageError && <p className="mt-3 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-xs font-bold text-state-critical" role="alert">{manageError}</p>}
                {manageMessage && <p className="mt-3 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-xs font-bold text-state-healthy" role="status">{manageMessage}</p>}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="public-booking-page min-h-screen bg-canvas px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-sm font-bold tracking-wide text-accent uppercase">{event.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{event.durationMinutes} minutes · {event.timeZone}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><ShieldCheck className="size-4 text-state-healthy" /> Réservation sécurisée</div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.5fr)] lg:items-start">
          <section className="sticker-card p-6 sm:p-8">
            <p className="text-sm font-bold text-accent">Une étape avant les créneaux</p>
            <h1 className="mt-2 text-3xl leading-tight font-bold">{event.publicHeading}</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{event.publicDescription}</p>
            {event.description && <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-6">{event.description}</p>}

            <form onSubmit={unlockAvailability} className="mt-7 flex flex-col gap-4" noValidate>
              <Field label="Prénom" error={fieldErrors.firstName?.[0]}>
                <input required autoComplete="given-name" value={contact.firstName} onChange={(input) => updateContact("firstName", input.target.value)} onBlur={captureContactNow} className="public-booking-input" />
              </Field>
              <Field label="Nom" error={fieldErrors.lastName?.[0]}>
                <input required autoComplete="family-name" value={contact.lastName} onChange={(input) => updateContact("lastName", input.target.value)} onBlur={captureContactNow} className="public-booking-input" />
              </Field>
              <Field label="Téléphone" error={fieldErrors.phone?.[0]} hint="Avec ton indicatif pays, par exemple +33.">
                <input required type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(input) => updateContact("phone", input.target.value)} onBlur={captureContactNow} className="public-booking-input" />
              </Field>
              {error && <p className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm font-bold text-state-critical" role="alert">{error}</p>}
              {captureStatus === "saved" && !unlocked && <p className="text-xs font-bold text-state-healthy" role="status">Ton information est enregistrée automatiquement.</p>}
              {!unlocked ? (
                <button type="submit" disabled={isPending} className="public-booking-primary">
                  {isPending ? "Vérification…" : "Voir les créneaux"}
                </button>
              ) : (
                <p className="rounded-[var(--radius-control)] bg-state-healthy-bg px-3 py-2 text-sm font-bold text-foreground">Coordonnées enregistrées. Choisis maintenant ton créneau.</p>
              )}
              <p className="text-xs leading-5 text-muted-foreground">En continuant, tu acceptes d&apos;être recontacté au sujet de cet appel. Tes informations restent liées à cette réservation.</p>
            </form>
          </section>

          <section ref={calendarRef} tabIndex={-1} aria-label="Disponibilités" className="sticker-card relative min-h-[520px] overflow-hidden p-5 outline-none focus-visible:ring-3 focus-visible:ring-accent/20 sm:p-7">
            {!unlocked ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/90 p-6">
                <div aria-hidden="true" className="pointer-events-none w-full select-none blur-md opacity-50">
                  <SlotSkeleton />
                </div>
                <div className="absolute max-w-xs rounded-[var(--radius-card)] border border-border bg-background/95 p-5 text-center shadow-lg">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-accent/10 text-accent"><LockKeyhole className="size-5" /></div>
                  <p className="mt-3 font-bold">Les créneaux sont prêts</p>
                  <p className="mt-1 text-sm text-muted-foreground">Laisse tes coordonnées pour voir les disponibilités et choisir ton appel.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Choisis ton créneau</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Les heures sont affichées dans {displayTimeZone}.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <span className="sr-only">Fuseau horaire</span>
                    <select value={displayTimeZone} onChange={(input) => setDisplayTimeZone(input.target.value)} className="rounded-[var(--radius-control)] border border-border bg-background px-2 py-1.5 text-xs">
                      <option value={guestTimeZone}>Mon fuseau ({guestTimeZone})</option>
                      <option value={event.timeZone}>Fuseau de l&apos;événement ({event.timeZone})</option>
                    </select>
                  </label>
                </div>
                {groupedSlots.length === 0 ? (
                  <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center">
                    <p className="font-bold">Aucun créneau disponible</p>
                    <p className="mt-1 text-sm text-muted-foreground">Reviens un peu plus tard ou contacte-nous directement.</p>
                  </div>
                ) : (
                  <div className="mt-6 flex flex-col gap-6">
                    {groupedSlots.map((group) => (
                      <div key={group.label}>
                        <h3 className="text-sm font-bold capitalize">{group.label}</h3>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {group.slots.map((slot) => {
                            const selected = selectedSlot?.startAt === slot.startAt;
                            return <button key={slot.startAt} type="button" disabled={isHolding || isPending} onClick={() => void holdSlot(slot)} className={`min-h-11 rounded-[var(--radius-control)] border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${selected ? "border-accent bg-accent text-white" : "border-border bg-background hover:border-accent hover:bg-accent/5"}`}>{formatSlot(slot.startAt, displayTimeZone)}</button>;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <p><MapPin className="mr-1 inline size-3.5" />{event.meetingLabel}</p>
                    {holdExpiresAt && <p role="status">Créneau réservé temporairement, confirme pour le garder.</p>}
                  </div>
                  <button type="button" disabled={!selectedSlot || isPending || isHolding || !holdExpiresAt} onClick={confirmBooking} className="public-booking-primary sm:w-auto">
                    {isHolding ? "Réservation temporaire…" : isPending ? "Confirmation…" : selectedSlot ? "Confirmer ce créneau" : "Sélectionne un créneau"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-bold">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs font-bold text-state-critical" role="alert">{error}</span>}
    </label>
  );
}

function SlotSkeleton() {
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="h-7 w-48 rounded bg-muted" />
      {["Lundi 12 mai", "Mardi 13 mai", "Mercredi 14 mai"].map((day) => (
        <div key={day}>
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-11 rounded border border-border bg-muted" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
