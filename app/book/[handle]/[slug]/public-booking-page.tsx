"use client";

import { getCountries, getCountryCallingCode, isValidPhoneNumber as isValidPhone, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { LockKeyhole, MapPin, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  captureMetaTrackingInBrowser,
  mergeMetaTracking,
  readMetaTracking,
  readStoredMetaTracking,
} from "@/lib/meta-ads/tracking";

type Question = {
  id: string;
  type: "radio" | "checkbox" | "text" | "textarea" | "select";
  label: string;
  helpText: string | null;
  isRequired: boolean;
  options: string[];
  position: number;
};

type PublicEvent = {
  handle: string;
  slug: string;
  name: string;
  description: string;
  durationMinutes: number;
  timeZone: string;
  meetingLabel: string;
  meetingUrl: string | null;
  publicHeading: string;
  publicDescription: string;
  confirmationTitle: string;
  confirmationMessage: string;
  bookingInstructions: string;
  questions: Question[];
};

type Slot = { startAt: string; endAt: string };
type AnswerValue = string | string[];
type Contact = { firstName: string; lastName: string; email: string; phone: string };
type Stage = 1 | 2 | 3 | 4;
type ManagementMode = "unknown" | "loading" | "ready" | "invalid";

const EMPTY_CONTACT: Contact = { firstName: "", lastName: "", email: "", phone: "" };
const COUNTRY_CODES = getCountries();
const COUNTRY_NAMES: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  CA: "Canada",
  US: "États-Unis",
  GB: "Royaume-Uni",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  PT: "Portugal",
  NL: "Pays-Bas",
  LU: "Luxembourg",
};

function isCountryCode(value: string): value is CountryCode {
  return COUNTRY_CODES.some((country) => country === value);
}

function countryFlag(country: CountryCode): string {
  return country
    .split("")
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

function countryName(country: CountryCode): string {
  return COUNTRY_NAMES[country] ?? country;
}

function formatSlot(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(dateString));
}

function formatSlotDay(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(dateString));
}

function slotDayKey(dateString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(dateString));
}

function getBrowserMetaTracking() {
  const direct = readMetaTracking(Object.fromEntries(new URLSearchParams(window.location.search).entries()));
  return mergeMetaTracking(direct, readStoredMetaTracking());
}

function getUtmFromUrl(): Record<string, string> {
  const tracking = getBrowserMetaTracking();
  return Object.fromEntries(
    [
      ["utm_source", tracking.utmSource],
      ["utm_medium", tracking.utmMedium],
      ["utm_campaign", tracking.utmCampaign],
      ["utm_content", tracking.utmContent],
      ["utm_term", tracking.utmTerm],
    ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""),
  );
}

function phoneCandidate(value: string, countryCode: CountryCode): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  const national = digits.startsWith("0") ? digits.slice(1) : digits;
  return `+${getCountryCallingCode(countryCode)}${national}`;
}

function formatPhone(value: string): string {
  const parsed = parsePhoneNumberFromString(value, "FR");
  return parsed?.formatInternational() ?? value;
}

function answerPresent(value: AnswerValue | undefined): boolean {
  return Array.isArray(value) ? value.some((item) => item.trim()) : Boolean(value?.trim());
}

function getDraftKey(slug: string) {
  return `native-booking-draft:${slug}`;
}

function getUtmMetadata() {
  const params = new URLSearchParams(window.location.search);
  const tracking = getBrowserMetaTracking();
  return {
    leadSessionKey: window.sessionStorage.getItem(`native-booking-session:${window.location.pathname}`) ?? crypto.randomUUID(),
    landingPage: window.location.href,
    referrer: document.referrer || null,
    linkId: params.get("link") ?? params.get("link_id"),
    metaTouchpointToken: tracking.metaTouchpointToken,
    utm: getUtmFromUrl(),
  };
}

export function PublicBookingPage({ event }: { event: PublicEvent }) {
  const [stage, setStage] = useState<Stage>(1);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [countryCode, setCountryCode] = useState<CountryCode>("FR");
  const [countryNames, setCountryNames] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [guestTimeZone, setGuestTimeZone] = useState("Europe/Paris");
  const [displayTimeZone, setDisplayTimeZone] = useState(event.timeZone);
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [linkId, setLinkId] = useState<string | null>(null);
  const [metaTouchpointToken, setMetaTouchpointToken] = useState<string | null>(null);
  const [landingPage, setLandingPage] = useState<string | null>(null);
  const [referrer, setReferrer] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [confirmation, setConfirmation] = useState<null | {
    startAt: string;
    endAt: string;
    closerName: string;
    meetingUrl: string | null;
    cancellationToken: string | null;
    rescheduleToken: string | null;
    calendarSyncWarning?: boolean;
  }>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [holdExpiresAt, setHoldExpiresAt] = useState<string | null>(null);
  const [manageSlots, setManageSlots] = useState<Slot[]>([]);
  const [manageSlot, setManageSlot] = useState<Slot | null>(null);
  const [manageStatus, setManageStatus] = useState<"active" | "cancelled">("active");
  const [manageMessage, setManageMessage] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [managementMode, setManagementMode] = useState<ManagementMode>("unknown");
  const [bookingKey, setBookingKey] = useState("");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);
  const firstRevealedRef = useRef<HTMLInputElement>(null);
  const phoneCaptureRef = useRef<{ phone: string; promise: Promise<string | null> } | null>(null);

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      setGuestTimeZone(detected);
      setDisplayTimeZone(event.timeZone);
    }
    const params = new URLSearchParams(window.location.search);
    captureMetaTrackingInBrowser(params);
    const tracking = getBrowserMetaTracking();
    setUtm(getUtmFromUrl());
    setLinkId(params.get("link") ?? params.get("link_id"));
    setMetaTouchpointToken(tracking.metaTouchpointToken);
    setLandingPage(window.location.href);
    setReferrer(document.referrer || null);
    const displayNames = new Intl.DisplayNames(["fr-FR"], { type: "region" });
    setCountryNames(Object.fromEntries(COUNTRY_CODES.map((country) => [country, displayNames.of(country) ?? country])));

    const sessionKey = `native-booking-session:${window.location.pathname}`;
    if (!window.sessionStorage.getItem(sessionKey)) window.sessionStorage.setItem(sessionKey, crypto.randomUUID());
    const rawDraft = window.sessionStorage.getItem(getDraftKey(event.slug));
    const manageToken = params.get("manage") ?? params.get("cancel");
    if (manageToken) {
      setManagementMode("loading");
      setIsManaging(true);
      void fetch(`/api/public/booking/${event.handle}/${event.slug}?${params.get("manage") ? `manage=${encodeURIComponent(params.get("manage") ?? "")}` : `cancel=${encodeURIComponent(params.get("cancel") ?? "")}`}`)
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok || !payload.booking) throw new Error(payload.error ?? "Lien invalide");
          const booking = payload.booking as {
            startAt: string;
            endAt: string;
            firstName: string;
            lastName: string;
            email: string;
            closerName: string;
            meetingUrl: string | null;
            cancellationToken: string | null;
            rescheduleToken: string | null;
          };
          setContact({ firstName: booking.firstName, lastName: booking.lastName, email: booking.email, phone: "" });
          setConfirmation({
            startAt: booking.startAt,
            endAt: booking.endAt,
            closerName: booking.closerName,
            meetingUrl: booking.meetingUrl,
            cancellationToken: booking.cancellationToken,
            rescheduleToken: booking.rescheduleToken,
          });
          setManagementMode("ready");
        })
        .catch((cause: unknown) => {
          setManageError(cause instanceof Error ? cause.message : "Ce lien de gestion n’est plus valide.");
          setManagementMode("invalid");
        })
        .finally(() => setIsManaging(false));
    }
    if (!rawDraft || manageToken) return;
    try {
      const draft = JSON.parse(rawDraft) as {
        stage?: Stage;
        contact?: Contact;
        countryCode?: string;
        answers?: Record<string, AnswerValue>;
        leadId?: string | null;
        slots?: Slot[];
        displayTimeZone?: string;
      };
      if (draft.contact) setContact({ ...EMPTY_CONTACT, ...draft.contact });
      if (draft.answers) setAnswers(draft.answers);
      if (draft.leadId) setLeadId(draft.leadId);
      if (Array.isArray(draft.slots)) setSlots(draft.slots);
      if (draft.displayTimeZone === event.timeZone || draft.displayTimeZone === detected) setDisplayTimeZone(draft.displayTimeZone);
      if (draft.countryCode && isCountryCode(draft.countryCode)) setCountryCode(draft.countryCode);
      if (draft.stage && draft.stage >= 1 && draft.stage <= 4) setStage(draft.stage === 4 && !Array.isArray(draft.slots) ? 3 : draft.stage);
    } catch {
      window.sessionStorage.removeItem(getDraftKey(event.slug));
    }
  }, [event.handle, event.slug, event.timeZone]);

  useEffect(() => {
    window.sessionStorage.setItem(
      getDraftKey(event.slug),
      JSON.stringify({ stage, contact, countryCode, answers, leadId, slots, displayTimeZone })
    );
  }, [answers, contact, countryCode, displayTimeZone, event.slug, leadId, slots, stage]);

  useEffect(() => {
    if (stage < 2) return;
    const timer = window.setTimeout(() => firstRevealedRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [stage]);

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

  const phoneValue = phoneCandidate(contact.phone, countryCode);
  const phoneValid = isValidPhone(phoneValue);
  const identityValid = Boolean(contact.firstName.trim() && contact.lastName.trim());
  const qualificationValid = Boolean(contact.email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) && event.questions.every((question) => !question.isRequired || answerPresent(answers[question.id]));

  function metadata() {
    const values = getUtmMetadata();
    return {
      ...values,
      leadSessionKey: window.sessionStorage.getItem(`native-booking-session:${window.location.pathname}`) ?? values.leadSessionKey,
      landingPage,
      referrer,
      linkId,
      metaTouchpointToken: values.metaTouchpointToken ?? metaTouchpointToken,
      utm: { ...utm, ...getUtmFromUrl() },
    };
  }

  function updateContact(field: keyof Contact, value: string) {
    setContact((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
    setError(null);
  }

  function setFieldTouched(field: string) {
    if (field === "phone" && contact.phone && !phoneValid) setFieldErrors((current) => ({ ...current, phone: ["Saisis un numéro international valide."] }));
    if (field === "email" && contact.email && !qualificationEmailValid(contact.email)) setFieldErrors((current) => ({ ...current, email: ["Saisis une adresse email valide."] }));
  }

  function qualificationEmailValid(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  function updateAnswer(questionId: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setFieldErrors((current) => ({ ...current, [questionId]: [] }));
    setError(null);
  }

  function buildContactPayload() {
    const tracking = getBrowserMetaTracking();
    return {
      ...contact,
      phone: phoneCandidate(contact.phone, countryCode),
      email: contact.email.trim(),
      metaTouchpointToken: tracking.metaTouchpointToken ?? metaTouchpointToken,
    };
  }

  async function capturePhoneLead(phone: string) {
    const normalizedPhone = parsePhoneNumberFromString(phone, countryCode)?.number ?? phone;
    const existing = phoneCaptureRef.current;
    if (existing?.phone === normalizedPhone) return existing.promise;

    const promise = captureIdentity({ phone: normalizedPhone })
      .catch(() => {
        setError("Impossible d’enregistrer ton numéro. Réessaie dans un instant.");
        return null;
      })
      .finally(() => {
        if (phoneCaptureRef.current?.promise === promise) phoneCaptureRef.current = null;
      });
    phoneCaptureRef.current = { phone: normalizedPhone, promise };
    return promise;
  }

  async function validatePhoneStage() {
    setFieldErrors({});
    setError(null);
    if (!phoneValid) {
      setFieldErrors({ phone: ["Saisis un numéro international valide."] });
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "validate-phone", phone: phoneValue }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.phone) {
        setFieldErrors({ phone: [payload.error ?? "Numéro de téléphone invalide."] });
        return;
      }
      const capturedLeadId = await capturePhoneLead(payload.phone);
      if (!capturedLeadId) return;
      updateContact("phone", payload.phone);
      setEditingPhone(false);
      setStage((current) => (current < 2 ? 2 : current));
    } catch {
      setError("Impossible de vérifier le numéro. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  async function captureIdentity(contactOverride: Partial<Contact> = {}): Promise<string | null> {
    const payload = { ...buildContactPayload(), ...contactOverride };
    const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "capture", ...payload, guestTimeZone, ...metadata() }),
    });
    const result = await response.json();
    if (!response.ok || !result.leadId) {
      setError(result.error ?? "Impossible d’enregistrer tes coordonnées.");
      setFieldErrors(result.fieldErrors ?? {});
      return null;
    }
    setLeadId(result.leadId);
    return result.leadId;
  }

  async function continueIdentity() {
    setFieldErrors({});
    setError(null);
    if (!identityValid) {
      setFieldErrors({
        ...(contact.firstName.trim() ? {} : { firstName: ["Le prénom est requis."] }),
        ...(contact.lastName.trim() ? {} : { lastName: ["Le nom est requis."] }),
      });
      return;
    }
    setIsPending(true);
    try {
      const createdLeadId = await captureIdentity();
      if (createdLeadId) setStage((current) => (current < 3 ? 3 : current));
    } catch {
      setError("Impossible d’enregistrer tes coordonnées. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  function validateQualification() {
    const errors: Record<string, string[]> = {};
    if (!qualificationEmailValid(contact.email)) errors.email = ["Saisis une adresse email valide."];
    for (const question of event.questions) {
      if (question.isRequired && !answerPresent(answers[question.id])) errors[question.id] = ["Réponds à cette question pour continuer."];
    }
    return errors;
  }

  async function unlockAvailability(formEvent?: FormEvent<HTMLFormElement>) {
    formEvent?.preventDefault();
    const qualificationErrors = validateQualification();
    setFieldErrors(qualificationErrors);
    setError(null);
    if (Object.keys(qualificationErrors).length > 0) {
      const firstError = Object.keys(qualificationErrors)[0];
      document.getElementById(`question-${firstError}`)?.focus();
      return;
    }
    setIsPending(true);
    try {
      const createdLeadId = leadId ?? await captureIdentity();
      if (!createdLeadId) return;
      const payload = buildContactPayload();
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "unlock", ...payload, answers, guestTimeZone, ...metadata() }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Vérifie les informations saisies.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setSlots(result.slots ?? []);
      setLeadId(result.leadId ?? createdLeadId);
      setStage(4);
      window.setTimeout(() => calendarRef.current?.focus(), 80);
    } catch {
      setError("Impossible de charger les créneaux. Réessaie dans un instant.");
    } finally {
      setIsPending(false);
    }
  }

  async function touchLead(lastStep: "slot_selected" | "booking_failed", slot: Slot | null) {
    if (!leadId) return;
    try {
      await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "touch", ...buildContactPayload(), answers, guestTimeZone, leadId, lastStep, startAt: slot?.startAt ?? null }),
      });
    } catch {
      // A non-critical lead update must never block the reservation.
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
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "hold", ...buildContactPayload(), answers, guestTimeZone, startAt: slot.startAt, idempotencyKey, leadId, utm, landingPage, referrer, linkId, metaTouchpointToken: getUtmMetadata().metaTouchpointToken ?? metaTouchpointToken }),
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
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "book", ...buildContactPayload(), answers, guestTimeZone, startAt: selectedSlot.startAt, idempotencyKey, leadId, utm, landingPage, referrer, linkId, metaTouchpointToken: getUtmMetadata().metaTouchpointToken ?? metaTouchpointToken }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Ce créneau n’est plus disponible.");
        void touchLead("booking_failed", selectedSlot);
        if (payload.code === "slot_unavailable") setSlots((current) => current.filter((slot) => slot.startAt !== selectedSlot.startAt));
        return;
      }
      setConfirmation(payload.booking);
      window.sessionStorage.removeItem(getDraftKey(event.slug));
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
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
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
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
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
      const response = await fetch(`/api/public/booking/${event.handle}/${event.slug}`, {
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
    const icsHref = confirmation.rescheduleToken ? `/api/public/booking/${event.handle}/${event.slug}/ics?token=${encodeURIComponent(confirmation.rescheduleToken)}` : null;
    return (
      <main className="public-booking-page min-h-screen bg-canvas px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <div className="sticker-card flex flex-col items-center gap-4 p-8 text-center sm:p-12">
            <div className="flex size-14 items-center justify-center rounded-full bg-state-healthy-bg text-state-healthy"><ShieldCheck className="size-7" /></div>
            <div>
              <p className={`text-sm font-bold ${confirmation.calendarSyncWarning ? "text-state-caution" : "text-state-healthy"}`}>{confirmation.calendarSyncWarning ? "Réservation enregistrée" : event.confirmationTitle}</p>
              <h1 className="mt-2 text-3xl font-bold">C&apos;est réservé, {contact.firstName}.</h1>
              <p className="mt-2 text-muted-foreground">{event.confirmationMessage}</p>
            </div>
            <div className="mt-3 w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-muted/50 p-5 text-left">
              <p className="font-bold">{formatSlotDay(confirmation.startAt, displayTimeZone)}</p>
              <p className="mt-1 text-xl font-bold">{formatSlot(confirmation.startAt, displayTimeZone)} – {formatSlot(confirmation.endAt, displayTimeZone)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{event.meetingLabel} · {displayTimeZone}</p>
              <p className="mt-1 text-sm font-bold">Avec {confirmation.closerName}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {confirmation.meetingUrl && <a className="text-sm font-bold text-accent underline" href={confirmation.meetingUrl}>Rejoindre le rendez-vous</a>}
                {icsHref && <a className="text-sm font-bold text-accent underline" href={icsHref}>Ajouter à l&apos;agenda (.ics)</a>}
              </div>
              {event.bookingInstructions && <p className="mt-3 whitespace-pre-line rounded-[var(--radius-control)] bg-background/70 px-3 py-2 text-sm text-muted-foreground">{event.bookingInstructions}</p>}
              {confirmation.calendarSyncWarning && <p className="mt-3 rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 px-3 py-2 text-xs font-bold text-state-caution">Ton rendez-vous est bien réservé, mais l&apos;agenda du closer doit être reconnecté.</p>}
            </div>
            {manageStatus === "cancelled" ? (
              <p className="w-full max-w-lg rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-4 py-3 text-sm font-bold text-foreground" role="status">{manageMessage ?? "Ce rendez-vous est annulé."}</p>
            ) : (confirmation.cancellationToken || confirmation.rescheduleToken) ? (
              <div className="w-full max-w-lg rounded-[var(--radius-card)] border border-border bg-background/70 p-4 text-left">
                <p className="text-sm font-bold">Gérer ce rendez-vous</p>
                <p className="mt-1 text-xs text-muted-foreground">Tu peux annuler ou choisir un autre créneau. Un email de mise à jour sera envoyé.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {confirmation.rescheduleToken && <button type="button" disabled={isManaging} onClick={() => void loadManageSlots()} className="min-h-11 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">{isManaging && manageSlots.length === 0 ? "Chargement…" : "Choisir un autre créneau"}</button>}
                  {confirmation.cancellationToken && <button type="button" disabled={isManaging} onClick={() => { if (window.confirm("Annuler ce rendez-vous ?")) void cancelConfirmedBooking(); }} className="min-h-11 rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Annuler le rendez-vous</button>}
                </div>
                {manageSlots.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-xs font-bold text-muted-foreground">Créneaux dans {displayTimeZone}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {manageSlots.map((slot) => <button key={slot.startAt} type="button" disabled={isManaging} onClick={() => setManageSlot(slot)} className={`min-h-11 rounded-[var(--radius-control)] border px-2 py-1.5 text-xs font-bold ${manageSlot?.startAt === slot.startAt ? "border-accent bg-accent text-primary-foreground" : "border-border hover:border-accent"}`}>{formatSlotDay(slot.startAt, displayTimeZone)} · {formatSlot(slot.startAt, displayTimeZone)}</button>)}
                    </div>
                    <button type="button" disabled={!manageSlot || isManaging} onClick={() => void rescheduleConfirmedBooking()} className="public-booking-primary mt-3">{isManaging ? "Déplacement…" : "Confirmer le nouveau créneau"}</button>
                  </div>
                )}
                {manageError && <p className="mt-3 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-xs font-bold text-state-critical" role="alert">{manageError}</p>}
                {manageMessage && <p className="mt-3 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2 text-xs font-bold text-foreground" role="status">{manageMessage}</p>}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  if (managementMode === "loading") {
    return (
      <main className="public-booking-page flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="sticker-card max-w-md p-8 text-center" role="status" aria-live="polite">
          <div className="mx-auto size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="mt-4 font-bold">Chargement de ton rendez-vous…</p>
        </div>
      </main>
    );
  }

  if (managementMode === "invalid") {
    return (
      <main className="public-booking-page flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
        <div className="sticker-card max-w-md p-8 text-center">
          <p className="font-bold">Ce lien de gestion n’est plus valide</p>
          <p className="mt-2 text-sm text-muted-foreground">Demande un nouveau lien depuis ton email de confirmation.</p>
          {manageError && <p className="mt-4 text-xs text-state-critical" role="alert">{manageError}</p>}
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

        <div className="sticker-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-center gap-4 border-b border-border bg-muted/40 px-4 py-3 text-xs font-bold sm:gap-8">
            <StepIndicator active={stage >= 1} current={stage < 4} label="Tes coordonnées" />
            <StepIndicator active={stage >= 4} current={stage === 4} label="Ton créneau" />
          </div>
          <div className="grid gap-0 lg:grid-cols-2">
            <section className="p-6 sm:p-8">
              <p className="text-sm font-bold text-accent">Une étape avant les créneaux</p>
              <h1 className="mt-2 text-3xl leading-tight font-bold">{event.publicHeading}</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{event.publicDescription}</p>
              {event.description && <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-6">{event.description}</p>}

              <div className="mt-7 flex flex-col gap-5" aria-live="polite">
                <section aria-labelledby="phone-stage-title">
                  <h2 id="phone-stage-title" className="sr-only">Palier 1 : téléphone</h2>
                  {stage >= 2 && !editingPhone ? (
                    <div className="flex min-h-12 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-muted/40 px-3">
                      <span className="flex items-center gap-2 text-sm font-bold"><span aria-hidden="true" className="text-foreground">✓</span><span className="font-mono">{formatPhone(contact.phone)}</span></span>
                      <button type="button" onClick={() => setEditingPhone(true)} className="min-h-11 px-2 text-xs font-bold text-accent hover:underline">Modifier</button>
                    </div>
                  ) : (
                    <div className="booking-stage">
                      <div className="flex flex-col gap-1.5 text-sm">
                        <label htmlFor="phone" className="font-bold">Téléphone</label>
                        <div className="flex min-h-12 overflow-hidden rounded-[var(--radius-control)] border border-border bg-background focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/10">
                          <div className="flex shrink-0 items-center border-r border-border bg-muted/50 px-2">
                            <span id="country-code-label" className="sr-only">Pays du numéro</span>
                            <span aria-hidden="true" className="text-base">{countryFlag(countryCode)}</span>
                            <select id="countryCode" aria-labelledby="country-code-label" value={countryCode} onChange={(input) => { if (isCountryCode(input.target.value)) setCountryCode(input.target.value); }} className="max-w-32 bg-transparent px-1 text-sm font-bold outline-none">
                              {COUNTRY_CODES.map((country) => <option key={country} value={country}>{country} +{getCountryCallingCode(country)} · {countryNames[country] ?? countryName(country)}</option>)}
                            </select>
                          </div>
                          <input id="phone" ref={stage === 1 ? firstRevealedRef : undefined} required type="tel" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(input) => updateContact("phone", input.target.value)} onBlur={() => { setFieldTouched("phone"); if (phoneValid) void capturePhoneLead(phoneValue); }} placeholder="6 12 34 56 78" className="min-w-0 flex-1 border-0 bg-transparent px-3 outline-none" />
                        </div>
                        {!fieldErrors.phone?.[0] && <span className="text-xs text-muted-foreground">Avec ton indicatif pays, par exemple +33.</span>}
                        {fieldErrors.phone?.[0] && <span className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.phone[0]}</span>}
                      </div>
                      {stage === 1 && <><button type="button" disabled={isPending || !phoneValid} onClick={() => void validatePhoneStage()} className="public-booking-primary mt-4">{isPending ? "Vérification…" : "Continuer"}</button></>}
                      {stage >= 2 && <button type="button" disabled={isPending || !phoneValid} onClick={() => void validatePhoneStage()} className="mt-2 text-xs font-bold text-accent disabled:cursor-not-allowed disabled:opacity-50">Valider ce numéro</button>}
                    </div>
                  )}
                </section>

                {stage >= 2 && (
                  <section className="booking-stage border-t border-dashed border-border pt-5" aria-labelledby="identity-stage-title">
                    <p className="mb-3 inline-flex rounded-full bg-accent/10 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-accent uppercase">Nouvelle étape</p>
                    <h2 id="identity-stage-title" className="text-sm font-bold">Tes coordonnées</h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Prénom" error={fieldErrors.firstName?.[0]} inputId="firstName">
                        <input id="firstName" ref={stage === 2 ? firstRevealedRef : undefined} required autoComplete="given-name" value={contact.firstName} onChange={(input) => updateContact("firstName", input.target.value)} onBlur={() => setFieldTouched("firstName")} className="public-booking-input" />
                      </Field>
                      <Field label="Nom" error={fieldErrors.lastName?.[0]} inputId="lastName">
                        <input id="lastName" required autoComplete="family-name" value={contact.lastName} onChange={(input) => updateContact("lastName", input.target.value)} onBlur={() => setFieldTouched("lastName")} className="public-booking-input" />
                      </Field>
                    </div>
                    {stage === 2 && <button type="button" disabled={isPending} onClick={() => void continueIdentity()} className="public-booking-primary mt-4">{isPending ? "Enregistrement…" : "Continuer"}</button>}
                  </section>
                )}

                {stage >= 3 && (
                  <form onSubmit={(formEvent) => void unlockAvailability(formEvent)} className="booking-stage border-t border-dashed border-border pt-5" aria-labelledby="qualification-stage-title" noValidate>
                    <p className="mb-3 inline-flex rounded-full bg-accent/10 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-accent uppercase">Nouvelle étape</p>
                    <h2 id="qualification-stage-title" className="text-sm font-bold">Quelques précisions avant les créneaux</h2>
                    <Field label="Email" error={fieldErrors.email?.[0]} hint="Utilisé pour confirmer ton rendez-vous." inputId="email">
                      <input id="email" ref={stage === 3 ? firstRevealedRef : undefined} required type="email" autoComplete="email" placeholder="ton@email.com" value={contact.email} onChange={(input) => updateContact("email", input.target.value)} onBlur={() => setFieldTouched("email")} className="public-booking-input" />
                    </Field>
                    {event.questions.length > 0 && <div className="mt-5 flex flex-col gap-5"><p className="font-mono text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Questions de l&apos;événement</p>{[...event.questions].sort((left, right) => left.position - right.position).map((question) => <QuestionField key={question.id} question={question} value={answers[question.id]} error={fieldErrors[question.id]?.[0]} onChange={(value) => updateAnswer(question.id, value)} />)}</div>}
                    <button type="submit" disabled={isPending || !qualificationValid} className="public-booking-primary mt-5">{isPending ? "Vérification…" : "Voir les créneaux →"}</button>
                  </form>
                )}

                <p className="text-xs leading-5 text-muted-foreground">En continuant, tu acceptes d&apos;être recontacté au sujet de cet appel. Tes informations restent liées à cette réservation.</p>
                {error && <p className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm font-bold text-state-critical" role="alert">{error}</p>}
              </div>
            </section>

            <section ref={calendarRef} tabIndex={-1} aria-label="Disponibilités" className="relative min-h-[520px] border-t border-border bg-muted/20 p-5 outline-none focus-visible:ring-3 focus-visible:ring-accent/20 lg:border-t-0 lg:border-l sm:p-7">
              {stage < 4 ? (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                  <div aria-hidden="true" className="pointer-events-none w-full select-none opacity-40 blur-[1.4px]"><SlotSkeleton /></div>
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
                      {guestTimeZone !== event.timeZone && <p className="mt-1 text-xs text-muted-foreground">Ton fuseau : {guestTimeZone}. <button type="button" onClick={() => setDisplayTimeZone(displayTimeZone === event.timeZone ? guestTimeZone : event.timeZone)} className="font-bold text-accent underline">{displayTimeZone === event.timeZone ? "Afficher dans mon fuseau" : "Revenir au fuseau de l’événement"}</button></p>}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                      <span className="sr-only">Fuseau horaire</span>
                      <select value={displayTimeZone} onChange={(input) => setDisplayTimeZone(input.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-2 py-1.5 text-xs">
                        <option value={event.timeZone}>Événement ({event.timeZone})</option>
                        <option value={guestTimeZone}>Mon fuseau ({guestTimeZone})</option>
                      </select>
                    </label>
                  </div>
                  {groupedSlots.length === 0 ? (
                    <div className="mt-10 rounded-[var(--radius-card)] border border-dashed border-border p-8 text-center"><p className="font-bold">Aucun créneau disponible</p><p className="mt-1 text-sm text-muted-foreground">Reviens un peu plus tard ou contacte-nous directement.</p></div>
                  ) : (
                    <div className="mt-6 flex flex-col gap-6">
                      {groupedSlots.map((group) => <div key={group.label}><h3 className="text-sm font-bold capitalize">{group.label}</h3><div className="mt-3 grid gap-2 sm:grid-cols-3">{group.slots.map((slot) => { const selected = selectedSlot?.startAt === slot.startAt; return <div key={slot.startAt} className={selected ? "flex min-w-0 gap-2 sm:col-span-2" : "min-w-0"}><button type="button" disabled={isHolding || isPending} onClick={() => void holdSlot(slot)} className={`min-h-11 rounded-full border px-3 py-2 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-60 ${selected ? "min-w-0 flex-1 border-accent bg-accent text-primary-foreground" : "w-full border-border bg-background hover:border-accent hover:bg-accent/5"}`}>{formatSlot(slot.startAt, displayTimeZone)}</button>{selected && <button type="button" disabled={isPending || isHolding || !holdExpiresAt} onClick={confirmBooking} className="public-booking-primary public-booking-inline min-h-11 shrink-0 px-4">{isPending ? "…" : "Confirmer"}</button>}</div>; })}</div></div>)}
                    </div>
                  )}
                  <div className="mt-7 border-t border-border pt-5">
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground"><p><MapPin className="mr-1 inline size-3.5" />{event.meetingLabel}</p>{holdExpiresAt && <p role="status">Créneau réservé temporairement, confirme pour le garder.</p>}</div>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function StepIndicator({ active, current, label }: { active: boolean; current: boolean; label: string }) {
  return <span className={`flex items-center gap-2 ${current ? "text-foreground" : active ? "text-state-healthy" : "text-muted-foreground"}`}><span className={`size-2 rounded-full ${current ? "bg-accent" : active ? "bg-state-healthy" : "bg-border"}`} />{label}</span>;
}

function Field({ label, hint, error, inputId, children }: { label: string; hint?: string; error?: string; inputId: string; children: ReactNode }) {
  return <label htmlFor={inputId} className="flex flex-col gap-1.5 text-sm"><span className="font-bold">{label}</span>{children}{hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}{error && <span className="text-xs font-bold text-state-critical" role="alert">{error}</span>}</label>;
}

function QuestionField({ question, value, error, onChange }: { question: Question; value: AnswerValue | undefined; error?: string; onChange: (value: AnswerValue) => void }) {
  const inputId = `question-${question.id}`;
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  if (question.type === "radio" || question.type === "checkbox") {
    return <fieldset id={inputId} className="flex flex-col gap-2" tabIndex={-1} aria-describedby={error ? `${inputId}-error` : undefined}><legend className="text-sm font-bold">{question.label}{!question.isRequired && <span className="ml-1 font-normal text-muted-foreground">(optionnel)</span>}</legend>{question.helpText && <p className="text-xs text-muted-foreground">{question.helpText}</p>}<div className="mt-1 flex flex-col gap-2">{question.options.map((option) => { const checked = selectedValues.includes(option); return <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 text-sm ${checked ? "border-accent bg-accent/5" : "border-border bg-background hover:border-accent"}`}><input type={question.type} name={inputId} value={option} checked={checked} onChange={(input) => { if (question.type === "radio") onChange(option); else onChange(input.target.checked ? [...selectedValues, option] : selectedValues.filter((item) => item !== option)); }} className="size-4 accent-accent" />{option}</label>; })}</div>{error && <p id={`${inputId}-error`} className="text-xs font-bold text-state-critical" role="alert">{error}</p>}</fieldset>;
  }
  return <div className="flex flex-col gap-1.5"><label htmlFor={inputId} className="text-sm font-bold">{question.label}{!question.isRequired && <span className="ml-1 font-normal text-muted-foreground">(optionnel)</span>}</label>{question.helpText && <p className="text-xs text-muted-foreground">{question.helpText}</p>}{question.type === "textarea" ? <textarea id={inputId} rows={3} value={typeof value === "string" ? value : ""} onChange={(input) => onChange(input.target.value)} className="public-booking-input resize-y" /> : question.type === "select" ? <select id={inputId} value={typeof value === "string" ? value : ""} onChange={(input) => onChange(input.target.value)} className="public-booking-input"><option value="">Sélectionne une réponse</option>{question.options.map((option) => <option key={option} value={option}>{option}</option>)}</select> : <input id={inputId} value={typeof value === "string" ? value : ""} onChange={(input) => onChange(input.target.value)} className="public-booking-input" />}{error && <p className="text-xs font-bold text-state-critical" role="alert">{error}</p>}</div>;
}

function SlotSkeleton() {
  return <div className="flex flex-col gap-5 p-5"><div className="h-7 w-48 rounded bg-muted" />{["Lundi 12 mai", "Mardi 13 mai", "Mercredi 14 mai"].map((day) => <div key={day}><div className="h-4 w-32 rounded bg-muted" /><div className="mt-3 grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-11 rounded border border-border bg-muted" />)}</div></div>)}</div>;
}
