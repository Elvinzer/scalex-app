"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, ExternalLink, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NativeBookingWindow } from "@/db/schema";

import {
  addNativeBookingCloserAction,
  createNativeBookingLinkAction,
  deleteNativeBookingExceptionAction,
  disconnectNativeBookingCalendarAction,
  saveNativeBookingAvailabilityAction,
  saveNativeBookingExceptionAction,
  saveNativeCalendarSelectionAction,
  toggleNativeBookingLinkAction,
  toggleNativeBookingCloserOffAction,
  updateNativeBookingEventAction,
} from "../actions";

type EventData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  minNoticeMinutes: number;
  bookingHorizonDays: number;
  timeZone: string;
  meetingLabel: string;
  meetingUrl: string | null;
  publicHeading: string;
  publicDescription: string;
  confirmationTitle: string;
  confirmationMessage: string;
  bookingInstructions: string;
  notifyCloserOnBooking: boolean;
  notifyCloserOnCancellation: boolean;
  notifyCloserOnReschedule: boolean;
  requireContactBeforeSlots: boolean;
  roundRobinEnabled: boolean;
};

type AvailabilityRow = { weekday: number; startTime: string; endTime: string };
type TimeWindowDraft = { startTime: string; endTime: string };
type DayDraft = { enabled: boolean; windows: TimeWindowDraft[] };
type CalendarOption = { id: string; name: string; isPrimary: boolean };
type CalendarSummary = {
  connectionId: string;
  provider: "google" | "outlook";
  email: string | null;
  status: "connected" | "reconnect_required" | "revoked";
  selectedCalendarIds: string[];
  options: CalendarOption[];
  loadError: boolean;
};
type BookingLinkSummary = {
  id: string;
  label: string;
  platform: string;
  contentLabel: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  isActive: boolean;
};

const WEEKDAYS = [
  [1, "Lundi"],
  [2, "Mardi"],
  [3, "Mercredi"],
  [4, "Jeudi"],
  [5, "Vendredi"],
  [6, "Samedi"],
  [0, "Dimanche"],
] as const;

function initialDays(rows: AvailabilityRow[]): Record<number, DayDraft> {
  const result: Record<number, DayDraft> = {};
  for (const [weekday] of WEEKDAYS) {
    const windows = rows
      .filter((item) => item.weekday === weekday)
      .map(({ startTime, endTime }) => ({ startTime, endTime }));
    result[weekday] = {
      enabled: windows.length > 0,
      windows: windows.length > 0 ? windows : [{ startTime: "09:00", endTime: "17:00" }],
    };
  }
  return result;
}

function formatPreviewSlot(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function EventEditor({
  event,
  availability,
  exceptions,
  closers,
  candidates,
  currentUserId,
  links,
  publicUrl,
  previewSlots,
}: {
  event: EventData;
  availability: AvailabilityRow[];
  exceptions: Array<{ date: string; type: "closed" | "custom"; windows: NativeBookingWindow[]; reason: string | null }>;
  closers: Array<{ id: string; name: string; email: string; isOff: boolean; isActive: boolean; calendars: CalendarSummary[] }>;
  candidates: Array<{ id: string; displayName: string | null; email: string }>;
  currentUserId: string;
  links: BookingLinkSummary[];
  publicUrl: string;
  previewSlots: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [days, setDays] = useState(() => initialDays(availability));
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionType, setExceptionType] = useState<"closed" | "custom">("closed");
  const [exceptionWindows, setExceptionWindows] = useState<TimeWindowDraft[]>([{ startTime: "09:00", endTime: "17:00" }]);
  const [exceptionReason, setExceptionReason] = useState("");
  const [selectedCloser, setSelectedCloser] = useState(candidates[0]?.id ?? "");
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [calendarSelections, setCalendarSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      closers.flatMap((closer) =>
        closer.calendars.map((calendar) => [`${closer.id}:${calendar.provider}`, calendar.selectedCalendarIds])
      )
    )
  );

  const assignedIds = useMemo(() => new Set(closers.map((closer) => closer.id)), [closers]);
  const availableCandidates = candidates.filter((candidate) => !assignedIds.has(candidate.id));

  function run(action: () => Promise<{ error: string | null }>, success: string) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setSaved(success);
        router.refresh();
      }
    });
  }

  function saveDetails(form: FormData) {
    run(
      () =>
        updateNativeBookingEventAction(event.id, {
          name: String(form.get("name") ?? ""),
          slug: String(form.get("slug") ?? ""),
          description: String(form.get("description") ?? ""),
          durationMinutes: Number(form.get("durationMinutes") ?? event.durationMinutes),
          bufferBeforeMinutes: Number(form.get("bufferBeforeMinutes") ?? 0),
          bufferAfterMinutes: Number(form.get("bufferAfterMinutes") ?? 0),
          minNoticeMinutes: Number(form.get("minNoticeMinutes") ?? 60),
          bookingHorizonDays: Number(form.get("bookingHorizonDays") ?? 30),
          timeZone: String(form.get("timeZone") ?? event.timeZone),
          meetingLabel: String(form.get("meetingLabel") ?? "Appel stratégique"),
          meetingUrl: String(form.get("meetingUrl") ?? "").trim() || null,
          publicHeading: String(form.get("publicHeading") ?? ""),
          publicDescription: String(form.get("publicDescription") ?? ""),
          confirmationTitle: String(form.get("confirmationTitle") ?? "Rendez-vous confirmé"),
          confirmationMessage: String(form.get("confirmationMessage") ?? ""),
          bookingInstructions: String(form.get("bookingInstructions") ?? ""),
          notifyCloserOnBooking: form.get("notifyCloserOnBooking") === "on",
          notifyCloserOnCancellation: form.get("notifyCloserOnCancellation") === "on",
          notifyCloserOnReschedule: form.get("notifyCloserOnReschedule") === "on",
          requireContactBeforeSlots: true,
          roundRobinEnabled: true,
        }),
      "Détails enregistrés."
    );
  }

  function saveAvailability() {
    run(
      () =>
        saveNativeBookingAvailabilityAction({
          eventId: event.id,
          availability: WEEKDAYS.map(([weekday]) => ({
            weekday,
            windows: days[weekday].enabled ? days[weekday].windows : [],
          })),
        }),
      "Disponibilités enregistrées."
    );
  }

  function addException() {
    if (!exceptionDate) {
      setError("Choisis une date d’exception.");
      return;
    }
    run(
      () =>
        saveNativeBookingExceptionAction({
          eventId: event.id,
          exception: {
            date: exceptionDate,
            type: exceptionType,
            windows: exceptionType === "custom" ? exceptionWindows : [],
            reason: exceptionReason.trim() || null,
          },
        }),
      "Exception ajoutée."
    );
    setExceptionDate("");
    setExceptionType("closed");
    setExceptionWindows([{ startTime: "09:00", endTime: "17:00" }]);
    setExceptionReason("");
  }

  function deleteException(date: string) {
    run(
      () => deleteNativeBookingExceptionAction({ eventId: event.id, date }),
      "Exception supprimée."
    );
  }

  function createLink(form: FormData) {
    run(
      () =>
        createNativeBookingLinkAction({
          eventId: event.id,
          label: String(form.get("label") ?? ""),
          platform: String(form.get("platform") ?? ""),
          contentLabel: String(form.get("contentLabel") ?? ""),
          utmSource: String(form.get("utmSource") ?? ""),
          utmMedium: String(form.get("utmMedium") ?? ""),
          utmCampaign: String(form.get("utmCampaign") ?? ""),
          utmContent: String(form.get("utmContent") ?? ""),
          utmTerm: String(form.get("utmTerm") ?? ""),
        }),
      "Lien UTM créé."
    );
  }

  async function copyLink(link: BookingLinkSummary) {
    const params = new URLSearchParams({ link: link.id });
    const values: Array<[string, string | null]> = [
      ["utm_source", link.utmSource],
      ["utm_medium", link.utmMedium],
      ["utm_campaign", link.utmCampaign],
      ["utm_content", link.utmContent],
      ["utm_term", link.utmTerm],
    ];
    for (const [key, value] of values) if (value) params.set(key, value);
    await navigator.clipboard.writeText(`${window.location.origin}${publicUrl}?${params.toString()}`);
    setCopiedLinkId(link.id);
    window.setTimeout(() => setCopiedLinkId(null), 1800);
  }

  function toggleLink(link: BookingLinkSummary) {
    run(
      () => toggleNativeBookingLinkAction({ eventId: event.id, linkId: link.id, isActive: !link.isActive }),
      link.isActive ? "Lien désactivé." : "Lien réactivé."
    );
  }

  function updateCalendarSelection(calendar: CalendarSummary, closerId: string, option: CalendarOption, checked: boolean) {
    const key = `${closerId}:${calendar.provider}`;
    setCalendarSelections((current) => {
      const selected = current[key] ?? calendar.selectedCalendarIds;
      const aliases = option.isPrimary ? [option.id, "primary"] : [option.id];
      const withoutOption = selected.filter((id) => !aliases.includes(id));
      return { ...current, [key]: checked ? [...withoutOption, option.id] : withoutOption };
    });
  }

  function saveCalendarSelection(calendar: CalendarSummary, closerId: string) {
    const key = `${closerId}:${calendar.provider}`;
    const selected = calendarSelections[key] ?? calendar.selectedCalendarIds;
    if (selected.length === 0) {
      setError("Sélectionne au moins un calendrier.");
      return;
    }
    run(
      () => saveNativeCalendarSelectionAction({ eventId: event.id, connectionId: calendar.connectionId, selectedCalendarIds: selected }),
      "Calendriers pris en compte enregistrés."
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="flex flex-col gap-5">
        <section className="sticker-card p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-lg font-bold">Détails de l&apos;événement</p>
            <p className="mt-1 text-sm text-muted-foreground">Le nom, le lien et le fuseau affichés sur ta page publique.</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveDetails(new FormData(event.currentTarget));
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Nom</span>
              <input name="name" defaultValue={event.name} required className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Slug public</span>
              <input name="slug" defaultValue={event.slug} required className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">Description interne</span>
              <textarea name="description" defaultValue={event.description} rows={2} className="booking-admin-input resize-y" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Durée (minutes)</span>
              <input name="durationMinutes" type="number" min={15} max={240} defaultValue={event.durationMinutes} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Fuseau de l&apos;événement</span>
              <input name="timeZone" defaultValue={event.timeZone} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Délai minimal (minutes)</span>
              <input name="minNoticeMinutes" type="number" min={0} max={10080} defaultValue={event.minNoticeMinutes} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Horizon (jours)</span>
              <input name="bookingHorizonDays" type="number" min={1} max={365} defaultValue={event.bookingHorizonDays} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Nom du rendez-vous</span>
              <input name="meetingLabel" defaultValue={event.meetingLabel} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Lien de réunion</span>
              <input name="meetingUrl" type="url" defaultValue={event.meetingUrl ?? ""} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">Titre public</span>
              <input name="publicHeading" defaultValue={event.publicHeading} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">Introduction publique</span>
              <textarea name="publicDescription" defaultValue={event.publicDescription} rows={2} className="booking-admin-input resize-y" />
            </label>
            <div className="sm:col-span-2 rounded-[var(--radius-card)] border border-border bg-muted/40 p-4">
              <p className="font-bold">Notifications, confirmation et personnalisation</p>
              <p className="mt-1 text-xs text-muted-foreground">Ces textes apparaissent après la réservation. Les notifications sont envoyées au closer sans ajouter d&apos;email obligatoire au formulaire prospect.</p>
              <div className="mt-3 grid gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">Titre de confirmation</span>
                  <input name="confirmationTitle" defaultValue={event.confirmationTitle} className="booking-admin-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">Message de confirmation</span>
                  <textarea name="confirmationMessage" defaultValue={event.confirmationMessage} rows={2} className="booking-admin-input resize-y" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">Consignes avant l&apos;appel</span>
                  <textarea name="bookingInstructions" defaultValue={event.bookingInstructions} rows={3} placeholder="Ex. Prépare tes chiffres et connecte-toi 5 minutes avant." className="booking-admin-input resize-y" />
                </label>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnBooking" defaultChecked={event.notifyCloserOnBooking} className="mt-0.5" />
                    <span>Confirmation</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnCancellation" defaultChecked={event.notifyCloserOnCancellation} className="mt-0.5" />
                    <span>Annulation</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnReschedule" defaultChecked={event.notifyCloserOnReschedule} className="mt-0.5" />
                    <span>Déplacement</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">Les coordonnées restent obligatoires avant les créneaux.</p>
              <Button type="submit" disabled={isPending}>{isPending ? "Enregistrement…" : "Enregistrer"}</Button>
            </div>
          </form>
        </section>

        <section className="sticker-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">Horaires et limites</p>
              <p className="mt-1 text-sm text-muted-foreground">Détermine les plages récurrentes dans le fuseau de l&apos;événement.</p>
            </div>
            <Button type="button" size="sm" onClick={saveAvailability} disabled={isPending}>Enregistrer les horaires</Button>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {WEEKDAYS.map(([weekday, label]) => (
              <div key={weekday} className="grid gap-3 py-3 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)] sm:items-start">
                <label className="flex items-center gap-2 pt-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={days[weekday].enabled}
                    onChange={(input) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], enabled: input.target.checked } }))}
                  />
                  {label}
                </label>
                <div className="flex flex-col gap-2">
                  {days[weekday].windows.map((window, windowIndex) => (
                    <div key={`${weekday}-${windowIndex}`} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`${label} plage ${windowIndex + 1} début`}
                        type="time"
                        value={window.startTime}
                        disabled={!days[weekday].enabled}
                        onChange={(input) =>
                          setDays((current) => ({
                            ...current,
                            [weekday]: {
                              ...current[weekday],
                              windows: current[weekday].windows.map((item, index) =>
                                index === windowIndex ? { ...item, startTime: input.target.value } : item
                              ),
                            },
                          }))
                        }
                        className="booking-admin-input w-32"
                      />
                      <span className="text-sm text-muted-foreground">à</span>
                      <input
                        aria-label={`${label} plage ${windowIndex + 1} fin`}
                        type="time"
                        value={window.endTime}
                        disabled={!days[weekday].enabled}
                        onChange={(input) =>
                          setDays((current) => ({
                            ...current,
                            [weekday]: {
                              ...current[weekday],
                              windows: current[weekday].windows.map((item, index) =>
                                index === windowIndex ? { ...item, endTime: input.target.value } : item
                              ),
                            },
                          }))
                        }
                        className="booking-admin-input w-32"
                      />
                      <button
                        type="button"
                        aria-label={`Supprimer la plage ${windowIndex + 1} du ${label}`}
                        disabled={!days[weekday].enabled || days[weekday].windows.length === 1}
                        onClick={() =>
                          setDays((current) => ({
                            ...current,
                            [weekday]: {
                              ...current[weekday],
                              windows: current[weekday].windows.filter((_, index) => index !== windowIndex),
                            },
                          }))
                        }
                        className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted hover:text-state-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!days[weekday].enabled || days[weekday].windows.length >= 4}
                    onClick={() =>
                      setDays((current) => ({
                        ...current,
                        [weekday]: {
                          ...current[weekday],
                          windows: [...current[weekday].windows, { startTime: "13:00", endTime: "17:00" }],
                        },
                      }))
                    }
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="size-3.5" /> Ajouter une plage
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <p className="font-bold">Exceptions de date</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(150px,0.7fr)_minmax(0,1fr)_auto]">
              <input type="date" value={exceptionDate} onChange={(input) => setExceptionDate(input.target.value)} className="booking-admin-input" aria-label="Date indisponible" />
              <select value={exceptionType} onChange={(input) => setExceptionType(input.target.value as "closed" | "custom")} className="booking-admin-input" aria-label="Type d’exception">
                <option value="closed">Jour fermé</option>
                <option value="custom">Horaires personnalisés</option>
              </select>
              <input value={exceptionReason} onChange={(input) => setExceptionReason(input.target.value)} placeholder="Motif (facultatif)" className="booking-admin-input" />
              <Button type="button" variant="outline" onClick={addException} disabled={isPending}>Ajouter une indisponibilité</Button>
            </div>
            {exceptionType === "custom" && (
              <div className="mt-3 flex flex-col gap-2 rounded-[var(--radius-control)] bg-muted/50 p-3">
                <p className="text-xs font-bold text-muted-foreground">Plages ouvertes pour cette date</p>
                {exceptionWindows.map((window, windowIndex) => (
                  <div key={`exception-${windowIndex}`} className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label={`Exception plage ${windowIndex + 1} début`}
                      type="time"
                      value={window.startTime}
                      onChange={(input) => setExceptionWindows((current) => current.map((item, index) => index === windowIndex ? { ...item, startTime: input.target.value } : item))}
                      className="booking-admin-input w-32"
                    />
                    <span className="text-sm text-muted-foreground">à</span>
                    <input
                      aria-label={`Exception plage ${windowIndex + 1} fin`}
                      type="time"
                      value={window.endTime}
                      onChange={(input) => setExceptionWindows((current) => current.map((item, index) => index === windowIndex ? { ...item, endTime: input.target.value } : item))}
                      className="booking-admin-input w-32"
                    />
                    <button
                      type="button"
                      aria-label={`Supprimer la plage d’exception ${windowIndex + 1}`}
                      disabled={exceptionWindows.length === 1}
                      onClick={() => setExceptionWindows((current) => current.filter((_, index) => index !== windowIndex))}
                      className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-background hover:text-state-critical disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={exceptionWindows.length >= 4}
                  onClick={() => setExceptionWindows((current) => [...current, { startTime: "13:00", endTime: "17:00" }])}
                  className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="size-3.5" /> Ajouter une plage
                </button>
              </div>
            )}
            {exceptions.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {exceptions.map((exception) => (
                  <li key={exception.date} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-muted px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-bold">{exception.date} · {exception.type === "custom" ? "Horaires personnalisés" : "Jour fermé"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {exception.type === "custom" ? exception.windows.map((window) => `${window.startTime}–${window.endTime}`).join(" · ") : "Aucun créneau"}
                        {exception.reason ? ` · ${exception.reason}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Supprimer l’exception du ${exception.date}`}
                      disabled={isPending}
                      onClick={() => deleteException(exception.date)}
                      className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-background hover:text-state-critical disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <p className="font-bold">Aperçu des prochains créneaux</p>
            <p className="mt-1 text-xs text-muted-foreground">Aperçu basé sur les règles enregistrées, hors agendas personnels et rendez-vous déjà pris.</p>
            {previewSlots.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {previewSlots.map((slot) => (
                  <div key={slot} className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm font-bold">
                    {formatPreviewSlot(slot, event.timeZone)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm text-muted-foreground">Aucun créneau généré avec la configuration actuelle.</p>
            )}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-5">
        <section className="sticker-card p-5">
          <p className="text-lg font-bold">Closers</p>
          <p className="mt-1 text-sm text-muted-foreground">Les rendez-vous sont répartis en round robin entre les closers disponibles.</p>
          <div className="mt-4 flex flex-col gap-2">
            {closers.map((closer) => (
              <div key={closer.id} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{closer.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{closer.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => toggleNativeBookingCloserOffAction({ eventId: event.id, closerUserId: closer.id, isOff: !closer.isOff }),
                        closer.isOff ? "Closer remis en ligne." : "Closer mis off."
                      )
                    }
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${closer.isOff ? "border-state-caution/30 bg-state-caution/10 text-state-caution" : "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"}`}
                  >
                    {closer.isOff ? "Off" : "Disponible"}
                  </button>
                </div>
                <div className="rounded-[var(--radius-control)] bg-muted/50 p-2.5 text-xs">
                  <p className="flex items-center gap-1.5 font-bold">
                    <CalendarCheck2 className="size-3.5 text-accent" />
                    Agenda externe
                  </p>
                  {closer.calendars.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-muted-foreground">
                      {closer.calendars.map((calendar) => (
                        <div key={calendar.provider} className="w-full">
                          <p className={calendar.status === "connected" ? "text-state-healthy" : "text-state-caution"}>
                            {calendar.provider === "google" ? "Google" : "Outlook"}: {calendar.status === "connected" ? "connecté" : "reconnexion requise"}
                            {calendar.email ? ` · ${calendar.email}` : ""}
                          </p>
                          {calendar.loadError && <p className="mt-1 text-state-caution">Impossible de charger les calendriers. Reconnecte ce compte.</p>}
                          {calendar.status === "connected" && calendar.options.length > 0 && (
                            <details className="mt-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-2">
                              <summary className="cursor-pointer font-bold">Calendriers pris en compte</summary>
                              <div className="mt-2 flex flex-col gap-2">
                                {calendar.options.map((option) => {
                                  const key = `${closer.id}:${calendar.provider}`;
                                  const selected = calendarSelections[key] ?? calendar.selectedCalendarIds;
                                  const isChecked = selected.includes(option.id) || (option.isPrimary && selected.includes("primary"));
                                  return (
                                    <label key={option.id} className="flex items-center gap-2 text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(input) => updateCalendarSelection(calendar, closer.id, option, input.target.checked)}
                                      />
                                      <span className="truncate">{option.name}{option.isPrimary ? " · principal" : ""}</span>
                                    </label>
                                  );
                                })}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending || (calendarSelections[`${closer.id}:${calendar.provider}`] ?? calendar.selectedCalendarIds).length === 0}
                                  onClick={() => saveCalendarSelection(calendar, closer.id)}
                                >
                                  Enregistrer la sélection
                                </Button>
                              </div>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Aucun agenda relié. Les créneaux ne tiendront pas compte de son calendrier personnel.</p>
                  )}
                  {closer.id === currentUserId && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(["google", "outlook"] as const).map((provider) => {
                        const connection = closer.calendars.find((calendar) => calendar.provider === provider);
                        return (
                          <div key={provider} className="flex items-center gap-2">
                            <a href={`/api/native-calendar/${provider}/connect`} className="inline-flex items-center gap-1 font-bold text-accent hover:underline">
                              {connection ? "Reconnecter" : "Relier"} {provider === "google" ? "Google" : "Outlook"} <ExternalLink className="size-3" />
                            </a>
                            {connection && (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => run(() => disconnectNativeBookingCalendarAction({ eventId: event.id, provider }), `${provider === "google" ? "Google" : "Outlook"} déconnecté.`)}
                                className="text-xs font-bold text-muted-foreground hover:text-state-critical disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Déconnecter
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {availableCandidates.length > 0 && (
            <div className="mt-4 flex gap-2">
              <select value={selectedCloser} onChange={(input) => setSelectedCloser(input.target.value)} className="booking-admin-input min-w-0">
                {availableCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.displayName || candidate.email}</option>)}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || !selectedCloser}
                onClick={() => run(() => addNativeBookingCloserAction({ eventId: event.id, closerUserId: selectedCloser }), "Closer ajouté.")}
              >
                Ajouter
              </Button>
            </div>
          )}
        </section>

        <section className="sticker-card border-accent/30 bg-accent-soft p-5">
          <p className="text-lg font-bold">Capture avant les créneaux</p>
          <p className="mt-2 text-sm text-muted-foreground">Prénom, nom et téléphone sont demandés avant de dévoiler la disponibilité. Chaque information saisie est enregistrée automatiquement pour permettre une relance si le prospect abandonne.</p>
          <div className="mt-4 rounded-[var(--radius-control)] bg-background/70 p-3 text-sm">
            <p className="font-bold">Lien public</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{publicUrl}</p>
          </div>
        </section>

        <section className="sticker-card p-5">
          <div>
            <p className="text-lg font-bold">Liens par source</p>
            <p className="mt-1 text-sm text-muted-foreground">Crée un lien par vidéo, post ou communauté pour retrouver l&apos;origine de chaque appel.</p>
          </div>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              createLink(new FormData(formEvent.currentTarget));
              formEvent.currentTarget.reset();
            }}
          >
            <input name="label" required placeholder="Nom du lien · ex. YouTube vidéo 12" className="booking-admin-input" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="platform" defaultValue="youtube" className="booking-admin-input">
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="skool">Skool</option>
                <option value="other">Autre</option>
              </select>
              <input name="contentLabel" placeholder="Contenu · ex. vidéo #12" className="booking-admin-input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="utmSource" placeholder="utm_source · youtube" className="booking-admin-input" />
              <input name="utmMedium" placeholder="utm_medium · video" className="booking-admin-input" />
              <input name="utmCampaign" placeholder="utm_campaign · lancement" className="booking-admin-input" />
              <input name="utmContent" placeholder="utm_content · video-12" className="booking-admin-input" />
              <input name="utmTerm" placeholder="utm_term · optionnel" className="booking-admin-input sm:col-span-2" />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>Créer le lien UTM</Button>
          </form>
          {links.length > 0 && (
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              {links.map((link) => (
                <div key={link.id} className={`rounded-[var(--radius-control)] p-3 ${link.isActive ? "bg-muted/60" : "bg-muted/30 opacity-75"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{link.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{link.platform}{link.contentLabel ? ` · ${link.contentLabel}` : ""} · {link.isActive ? "Actif" : "Désactivé"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button type="button" disabled={!link.isActive} onClick={() => copyLink(link)} className="text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40">
                        {copiedLinkId === link.id ? "Copié" : "Copier"}
                      </button>
                      <button type="button" disabled={isPending} onClick={() => toggleLink(link)} className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
                        {link.isActive ? "Désactiver" : "Réactiver"}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{link.utmSource || "utm_source non défini"} · {link.utmContent || "contenu non défini"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>

      {(error || saved) && (
        <div className={`fixed right-4 bottom-4 z-20 rounded-[var(--radius-control)] border px-4 py-3 text-sm font-bold shadow-lg ${error ? "border-state-critical/30 bg-state-critical-bg text-state-critical" : "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"}`} role={error ? "alert" : "status"}>
          {error || saved}
        </div>
      )}
    </div>
  );
}
