"use client";

import { CheckCircle2, MessageCircle, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type RefObject } from "react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { phoneHref, whatsappHref as buildWhatsAppHref } from "@/lib/native-booking/phone-links";

import {
  cancelNativeBookingAction,
  getNativeBookingRescheduleSlotsAction,
  rescheduleNativeBookingAction,
} from "./actions";

type Appointment = {
  id: string;
  source: "native" | "iclosed" | "calendly";
  sourceLabel: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  durationEstimated: boolean;
  status: "confirmed" | "cancelled" | "past";
  prospectName: string;
  email: string | null;
  phone: string | null;
  closerId: string | null;
  closerName: string;
  eventName: string;
  nativeBookingId: string | null;
  salesCallId: string | null;
  answers: Array<{ questionId: string; label: string; answer: string | string[] }>;
  canManage: boolean;
  attendance: string | null;
  outcome: string | null;
  activities: Array<{
    kind: "booked" | "rescheduled" | "cancelled";
    fromStartAt: string | null;
    fromEndAt: string | null;
    toStartAt: string | null;
    toEndAt: string | null;
    fromCloserName: string | null;
    toCloserName: string | null;
    createdAt: string;
  }>;
};

type AgendaFilters = {
  view: "agenda" | "week" | "list";
  source: string[];
  closerIds: string[];
  status: string[];
  range: "today" | "next7" | "next30" | "custom";
  from: string | null;
  to: string | null;
  timeZone: string;
};

const VIEW_LABELS = { agenda: "Agenda", week: "Semaine", list: "Liste" } as const;
const SOURCE_STYLES = {
  native: "border-accent/30 bg-accent-soft text-accent-text",
  iclosed: "border-state-caution/30 bg-state-caution/10 text-state-caution",
  calendly: "border-state-healthy/30 bg-state-healthy-bg text-state-healthy",
} as const;
const STATUS_LABELS = { confirmed: "Confirmé", cancelled: "Annulé", past: "Passé" } as const;

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
}

function dayKey(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function whatsappHref(appointment: Appointment, timeZone: string) {
  if (!appointment.phone) return null;
  const firstName = appointment.prospectName.split(" ")[0] ?? appointment.prospectName;
  const date = `${formatDay(appointment.startAt, timeZone)} à ${formatTime(appointment.startAt, timeZone)}`;
  const message = `Bonjour ${firstName}, ton rendez-vous ${appointment.eventName} est prévu le ${date}.`;
  return buildWhatsAppHref(appointment.phone, message);
}

function localDateToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateInputValue(value: string | null, timeZone: string): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : "";
}

function formatActivityTime(value: string | null, timeZone: string): string {
  return value ? `${formatDay(value, timeZone)} · ${formatTime(value, timeZone)}` : "—";
}

export function UnifiedAgenda({ appointments, filters }: { appointments: Appointment[]; filters: AgendaFilters }) {
  const router = useRouter();
  const [drawerAppointment, setDrawerAppointment] = useState<Appointment | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveSlots, setMoveSlots] = useState<Array<{ startAt: string; endAt: string }>>([]);
  const [selectedMoveSlot, setSelectedMoveSlot] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<Appointment | null>(null);
  const [hiddenAppointmentIds, setHiddenAppointmentIds] = useState<Set<string>>(() => new Set());
  const [isPending, startTransition] = useTransition();
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const params = new URLSearchParams(window.location.search);
    if (browserTimeZone && !params.has("tz") && browserTimeZone !== filters.timeZone) {
      params.set("tz", browserTimeZone);
      router.replace(`/ventes/rdv?${params.toString()}`);
    }
  }, [filters.timeZone, router]);

  useEffect(() => {
    if (!drawerAppointment) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerAppointment(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [drawerAppointment]);

  useEffect(() => {
    if (!actionMessage) return;
    const timeout = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

  useEffect(() => {
    setHiddenAppointmentIds((current) => {
      const next = new Set(Array.from(current).filter((id) => appointments.find((appointment) => appointment.id === id)?.status === "confirmed"));
      return next.size === current.size ? current : next;
    });
  }, [appointments]);

  const closers = useMemo(() => {
    const map = new Map<string, string>();
    for (const appointment of appointments) if (appointment.closerId) map.set(appointment.closerId, appointment.closerName);
    return Array.from(map, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }, [appointments]);

  function updateUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    if (!params.get("tz")) params.set("tz", Intl.DateTimeFormat().resolvedOptions().timeZone || filters.timeZone);
    router.push(`/ventes/rdv?${params.toString()}`);
  }

  function openMove(appointment: Appointment) {
    if (!appointment.nativeBookingId) return;
    setActionError(null);
    setActionMessage(null);
    setDrawerAppointment(appointment);
    setMovingId(appointment.id);
    setSelectedMoveSlot(null);
    startTransition(async () => {
      const result = await getNativeBookingRescheduleSlotsAction({ bookingId: appointment.nativeBookingId });
      if (result.error) setActionError(result.error);
      setMoveSlots(result.slots);
    });
  }

  function confirmMove() {
    if (!drawerAppointment?.nativeBookingId || !selectedMoveSlot) return;
    setActionError(null);
    setActionMessage(null);
    startTransition(async () => {
      const result = await rescheduleNativeBookingAction({ bookingId: drawerAppointment.nativeBookingId, startAt: selectedMoveSlot });
      if (result.error) {
        setActionError(result.error);
        return;
      }
      const nextStartAt = result.startAt;
      const nextEndAt = result.endAt;
      if (nextStartAt && nextEndAt) {
        setDrawerAppointment((current) => {
          if (!current) return current;
          return {
            ...current,
            startAt: nextStartAt,
            endAt: nextEndAt,
            closerName: result.closerName ?? current.closerName,
            activities: [
              ...current.activities,
              {
                kind: "rescheduled",
                fromStartAt: current.startAt,
                fromEndAt: current.endAt,
                toStartAt: nextStartAt,
                toEndAt: nextEndAt,
                fromCloserName: current.closerName,
                toCloserName: result.closerName ?? current.closerName,
                createdAt: new Date().toISOString(),
              },
            ],
          };
        });
      }
      setMovingId(null);
      setMoveSlots([]);
      setSelectedMoveSlot(null);
      setActionMessage(result.warning ? "Déplacement enregistré. Le calendrier du closer doit être vérifié." : "Rendez-vous déplacé avec succès.");
      router.refresh();
    });
  }

  function requestCancel(appointment: Appointment) {
    if (!appointment.nativeBookingId) return;
    setActionError(null);
    setActionMessage(null);
    setCancelError(null);
    setPendingCancel(appointment);
  }

  function closeCancelDialog() {
    if (isPending) return;
    setPendingCancel(null);
    setCancelError(null);
  }

  function confirmCancel() {
    const appointment = pendingCancel;
    if (!appointment?.nativeBookingId) return;
    setCancelError(null);
    startTransition(async () => {
      const result = await cancelNativeBookingAction({ bookingId: appointment.nativeBookingId });
      if (result.error) {
        setCancelError(result.error);
        return;
      }
      setHiddenAppointmentIds((current) => new Set(current).add(appointment.id));
      setPendingCancel(null);
      setDrawerAppointment(null);
      setMovingId(null);
      setMoveSlots([]);
      setSelectedMoveSlot(null);
      setActionMessage("Rendez-vous annulé. Le prospect reçoit un email de confirmation.");
      router.refresh();
    });
  }

  const visibleAppointments = useMemo(
    () => appointments.filter((appointment) => !hiddenAppointmentIds.has(appointment.id)),
    [appointments, hiddenAppointmentIds],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; appointments: Appointment[] }>();
    for (const appointment of visibleAppointments) {
      const key = dayKey(appointment.startAt, filters.timeZone);
      const group = map.get(key) ?? { label: formatDay(appointment.startAt, filters.timeZone), appointments: [] };
      group.appointments.push(appointment);
      map.set(key, group);
    }
    return Array.from(map.values());
  }, [filters.timeZone, visibleAppointments]);

  const resetFilters = () => updateUrl({ source: null, closer: null, status: null, range: "next7", from: null, to: null });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtres de l’agenda">
        <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label="Vue de l’agenda">
          {Object.entries(VIEW_LABELS).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filters.view === value} onClick={() => updateUrl({ view: value })} className={`min-h-11 rounded-full px-3 text-sm font-bold ${filters.view === value ? "bg-foreground text-background" : "text-foreground/70 hover:text-foreground"}`}>{label}</button>)}
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-bold"><span className="sr-only">Source</span><select value={filters.source.length === 1 ? filters.source[0] : "all"} onChange={(input) => updateUrl({ source: input.target.value === "all" ? null : input.target.value })} className="bg-transparent outline-none"><option value="all">Toutes les sources</option><option value="native">Natif</option><option value="iclosed">iClosed</option><option value="calendly">Calendly</option></select></label>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-bold"><span className="sr-only">Closer</span><select value={filters.closerIds.length === 1 ? filters.closerIds[0] : "all"} onChange={(input) => updateUrl({ closer: input.target.value === "all" ? null : input.target.value })} className="max-w-48 bg-transparent outline-none"><option value="all">Tous les closers</option>{closers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-bold"><span className="sr-only">Statut</span><select value={filters.status.length === 1 ? filters.status[0] : "all"} onChange={(input) => updateUrl({ status: input.target.value === "all" ? "confirmed,cancelled,past" : input.target.value })} className="bg-transparent outline-none"><option value="confirmed">Confirmés</option><option value="all">Tous les statuts</option><option value="cancelled">Annulés</option><option value="past">Passés</option></select></label>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-bold"><span className="sr-only">Période</span><select value={filters.range} onChange={(input) => updateUrl({ range: input.target.value, from: null, to: null })} className="bg-transparent outline-none"><option value="today">Aujourd&apos;hui</option><option value="next7">7 prochains jours</option><option value="next30">30 prochains jours</option><option value="custom">Plage personnalisée</option></select></label>
        <span className="ml-auto text-sm text-muted-foreground"><strong className="text-foreground">{visibleAppointments.length}</strong> rendez-vous</span>
      </div>

      {actionMessage && !drawerAppointment && <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-3 py-2.5 text-sm font-bold text-state-healthy" role="status" aria-live="polite"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{actionMessage}</span><button type="button" className="ml-auto min-h-7 min-w-7 rounded-full px-1 text-base leading-none hover:bg-background/60" aria-label="Fermer le message" onClick={() => setActionMessage(null)}>×</button></div>}

      {filters.range === "custom" && <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-xs font-bold"><span>Du</span><input type="date" value={dateInputValue(filters.from, filters.timeZone)} onChange={(input) => updateUrl({ from: localDateToIso(input.target.value) })} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3" /></label>
        <label className="flex flex-col gap-1 text-xs font-bold"><span>Au</span><input type="date" value={dateInputValue(filters.to, filters.timeZone)} onChange={(input) => updateUrl({ to: localDateToIso(input.target.value) })} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3" /></label>
        <p className="text-xs text-muted-foreground">Les dates sont converties en instants UTC selon ton navigateur.</p>
      </div>}

      {visibleAppointments.length === 0 ? <div className="sticker-card-dashed flex flex-col items-center gap-2 p-10 text-center"><p className="font-bold">Aucun rendez-vous sur cette période</p><p className="text-sm text-foreground/70">Aucune réservation ne correspond aux filtres actifs.</p><button type="button" onClick={resetFilters} className="min-h-11 text-sm font-bold text-accent-text underline">Réinitialiser les filtres</button></div> : filters.view === "agenda" ? <AgendaView groups={grouped} timeZone={filters.timeZone} onOpen={setDrawerAppointment} onMove={openMove} onCancel={requestCancel} /> : filters.view === "week" ? <WeekView appointments={visibleAppointments} timeZone={filters.timeZone} onOpen={setDrawerAppointment} /> : <ListView appointments={visibleAppointments} timeZone={filters.timeZone} onOpen={setDrawerAppointment} />}

      {drawerAppointment && <AppointmentDrawer closeRef={drawerCloseRef} appointment={drawerAppointment} timeZone={filters.timeZone} moving={movingId === drawerAppointment.id} moveSlots={moveSlots} selectedMoveSlot={selectedMoveSlot} actionError={actionError} actionMessage={actionMessage} isPending={isPending} onLoadMove={() => openMove(drawerAppointment)} onSelectMoveSlot={setSelectedMoveSlot} onMove={confirmMove} onCancel={() => requestCancel(drawerAppointment)} onClose={() => { setDrawerAppointment(null); setMovingId(null); setMoveSlots([]); setActionError(null); setActionMessage(null); }} />}

      <ConfirmationDialog
        open={pendingCancel !== null}
        title="Annuler ce rendez-vous ?"
        description="Le créneau sera libéré et le prospect recevra un email pour l’informer de l’annulation."
        detail={pendingCancel && <div className="flex flex-col gap-1"><p className="font-bold">{pendingCancel.prospectName}</p><p className="text-muted-foreground">{pendingCancel.eventName} · {formatDay(pendingCancel.startAt, filters.timeZone)} à {formatTime(pendingCancel.startAt, filters.timeZone)}</p></div>}
        confirmLabel="Annuler le rendez-vous"
        cancelLabel="Garder le rendez-vous"
        pending={isPending}
        error={cancelError}
        onCancel={closeCancelDialog}
        onConfirm={confirmCancel}
      />
    </section>
  );
}

function AgendaView({ groups, timeZone, onOpen, onMove, onCancel }: { groups: Array<{ label: string; appointments: Appointment[] }>; timeZone: string; onOpen: (appointment: Appointment) => void; onMove: (appointment: Appointment) => void; onCancel: (appointment: Appointment) => void }) {
  return <div className="flex flex-col gap-5">{groups.map((group) => <div key={group.label}><div className="mb-2 flex items-baseline justify-between gap-3"><h3 className="text-lg font-bold capitalize">{group.label}</h3><span className="text-xs text-muted-foreground">{group.appointments.length} appel{group.appointments.length > 1 ? "s" : ""}</span></div><div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-background">{group.appointments.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} timeZone={timeZone} onOpen={onOpen} onMove={onMove} onCancel={onCancel} />)}</div></div>)}</div>;
}

function AppointmentRow({ appointment, timeZone, onOpen, onMove, onCancel }: { appointment: Appointment; timeZone: string; onOpen: (appointment: Appointment) => void; onMove: (appointment: Appointment) => void; onCancel: (appointment: Appointment) => void }) {
  const call = phoneHref(appointment.phone);
  const whatsapp = whatsappHref(appointment, timeZone);
  return <article className="grid gap-3 border-b border-border p-4 last:border-b-0 hover:bg-muted/30 sm:grid-cols-[84px_minmax(0,1fr)_170px_auto] sm:items-center sm:gap-4"><div><p className="font-mono text-sm font-bold">{formatTime(appointment.startAt, timeZone)}</p><p className="font-mono text-xs text-muted-foreground">{appointment.durationMinutes} min{appointment.durationEstimated ? " · estimé" : ""}</p></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{appointment.prospectName}</p><StatusBadge status={appointment.status} /></div><p className="truncate text-xs text-muted-foreground">{appointment.email || "Email non renseigné"}{appointment.phone ? ` · ${appointment.phone}` : ""}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${SOURCE_STYLES[appointment.source]}`}>{appointment.sourceLabel}</span></div><div className="flex min-w-0 items-center gap-2"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">{initials(appointment.closerName)}</span><div className="min-w-0"><p className="truncate text-xs font-bold">{appointment.closerName}</p><p className="truncate text-[11px] text-muted-foreground">{appointment.eventName}</p></div></div><div className="flex flex-wrap items-center gap-2 sm:justify-end">{call && <a href={call} aria-label={`Appeler ${appointment.prospectName}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-bold hover:bg-muted"><Phone className="size-3.5" /> Appeler</a>}{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-state-healthy-bg px-3 text-xs font-bold text-state-healthy hover:underline"><MessageCircle className="size-3.5" /> WhatsApp</a>}<button type="button" onClick={() => onOpen(appointment)} className="min-h-11 rounded-full border border-border px-3 text-xs font-bold hover:bg-muted">Voir la fiche</button>{appointment.canManage && appointment.status === "confirmed" && <><button type="button" onClick={() => onMove(appointment)} className="min-h-11 rounded-full border border-border px-3 text-xs font-bold hover:bg-muted">Déplacer</button><button type="button" onClick={() => onCancel(appointment)} className="min-h-11 rounded-full border border-border px-3 text-xs font-bold text-state-critical hover:bg-state-critical-bg">Annuler</button></>}</div></article>;
}

function timeMinutes(value: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(value));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function WeekView({ appointments, timeZone, onOpen }: { appointments: Appointment[]; timeZone: string; onOpen: (appointment: Appointment) => void }) {
  const days = Array.from(new Set(appointments.map((appointment) => dayKey(appointment.startAt, timeZone))));
  const dayAppointments = days.map((day) => ({
    day,
    appointments: appointments.filter((appointment) => dayKey(appointment.startAt, timeZone) === day),
  }));
  const firstHour = 8 * 60;
  const lastHour = 20 * 60;
  const totalMinutes = lastHour - firstHour;
  const hours = Array.from({ length: 13 }, (_, index) => firstHour + index * 60);

  return (
    <div className="flex flex-col gap-3">
      <div className="md:hidden">
        <div className="flex flex-col gap-3">
          {dayAppointments.map(({ day, appointments: items }) => (
            <section key={day} className="rounded-[var(--radius-card)] border border-border bg-background p-3">
              <h3 className="border-b border-border pb-2 text-sm font-bold capitalize">{formatDay(items[0]?.startAt ?? new Date().toISOString(), timeZone)}</h3>
              <div className="mt-3 flex flex-col gap-2">
                {items.map((appointment) => (
                  <button key={appointment.id} type="button" onClick={() => onOpen(appointment)} className={`rounded-[var(--radius-control)] border-l-4 p-3 text-left ${SOURCE_STYLES[appointment.source]}`}>
                    <span className="font-mono text-xs font-bold">{formatTime(appointment.startAt, timeZone)} · {appointment.durationMinutes} min</span>
                    <span className="mt-1 block truncate text-xs font-bold">{appointment.prospectName}</span>
                    <span className="mt-1 block text-[10px]">{appointment.sourceLabel}{appointment.durationEstimated ? " · durée estimée" : ""}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-background md:block">
        <div className="grid min-w-[760px] grid-cols-[64px_minmax(0,1fr)]">
          <div aria-hidden="true" className="border-r border-border bg-muted/30" />
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(dayAppointments.length, 1)}, minmax(150px, 1fr))` }}>
            {dayAppointments.map(({ day, appointments: items }) => (
              <div key={day} className="border-r border-border p-3 last:border-r-0">
                <p className="truncate text-sm font-bold capitalize">{formatDay(items[0]?.startAt ?? new Date().toISOString(), timeZone)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{items.length} rendez-vous</p>
              </div>
            ))}
          </div>

          <div className="relative h-[720px] border-r border-border bg-muted/20">
            {hours.map((hour) => <span key={hour} className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground" style={{ top: `${((hour - firstHour) / totalMinutes) * 100}%` }}>{`${String(Math.floor(hour / 60)).padStart(2, "0")}:00`}</span>)}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(dayAppointments.length, 1)}, minmax(150px, 1fr))` }}>
            {dayAppointments.map(({ day, appointments: items }) => (
              <div key={day} className="relative h-[720px] border-r border-border last:border-r-0">
                {hours.map((hour) => <div key={hour} aria-hidden="true" className="absolute inset-x-0 border-t border-border/60" style={{ top: `${((hour - firstHour) / totalMinutes) * 100}%` }} />)}
                {items.map((appointment) => {
                  const start = timeMinutes(appointment.startAt, timeZone);
                  const end = Math.max(start + appointment.durationMinutes, timeMinutes(appointment.endAt, timeZone));
                  const top = Math.max(0, Math.min(96, ((start - firstHour) / totalMinutes) * 100));
                  const height = Math.max(6, Math.min(96 - top, ((end - start) / totalMinutes) * 100));
                  return <button key={appointment.id} type="button" onClick={() => onOpen(appointment)} aria-label={`${appointment.prospectName}, ${formatTime(appointment.startAt, timeZone)}, ${appointment.sourceLabel}`} className={`absolute inset-x-1 overflow-hidden rounded-[var(--radius-control)] border-l-4 p-2 text-left text-xs shadow-xs ${SOURCE_STYLES[appointment.source]}`} style={{ top: `${top}%`, height: `${height}%` }}><span className="font-mono font-bold">{formatTime(appointment.startAt, timeZone)}</span><span className="mt-1 block truncate font-bold">{appointment.prospectName}</span><span className="mt-1 block truncate text-[10px]">{appointment.sourceLabel} · {appointment.durationMinutes} min</span></button>;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListView({ appointments, timeZone, onOpen }: { appointments: Appointment[]; timeZone: string; onOpen: (appointment: Appointment) => void }) {
  return <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-background"><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Horaire</th><th className="px-4 py-3">Prospect</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Closer</th><th className="px-4 py-3">Statut</th><th className="px-4 py-3"><span className="sr-only">Action</span></th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id} className="border-t border-border"><td className="px-4 py-3 font-mono text-xs">{formatDay(appointment.startAt, timeZone)}<br />{formatTime(appointment.startAt, timeZone)} · {appointment.durationMinutes} min{appointment.durationEstimated ? " estimé" : ""}</td><td className="px-4 py-3"><span className="font-bold">{appointment.prospectName}</span><br /><span className="text-xs text-muted-foreground">{appointment.email || "Email non renseigné"}</span></td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-bold ${SOURCE_STYLES[appointment.source]}`}>{appointment.sourceLabel}</span></td><td className="px-4 py-3 text-xs font-bold">{appointment.closerName}</td><td className="px-4 py-3"><StatusBadge status={appointment.status} /></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => onOpen(appointment)} className="min-h-11 rounded-full border border-border px-3 text-xs font-bold hover:bg-muted">Voir la fiche</button></td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 p-3 md:hidden">{appointments.map((appointment) => <button key={appointment.id} type="button" onClick={() => onOpen(appointment)} className="rounded-[var(--radius-control)] border border-border p-3 text-left"><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold">{formatDay(appointment.startAt, timeZone)} · {formatTime(appointment.startAt, timeZone)}</span><StatusBadge status={appointment.status} /></div><p className="mt-2 font-bold">{appointment.prospectName}</p><p className="mt-1 text-xs text-muted-foreground">{appointment.sourceLabel} · {appointment.closerName} · {appointment.durationMinutes} min{appointment.durationEstimated ? " estimé" : ""}</p></button>)}</div></div>;
}

function AppointmentDrawer({ closeRef, appointment, timeZone, moving, moveSlots, selectedMoveSlot, actionError, actionMessage, isPending, onLoadMove, onSelectMoveSlot, onMove, onCancel, onClose }: { closeRef: RefObject<HTMLButtonElement | null>; appointment: Appointment; timeZone: string; moving: boolean; moveSlots: Array<{ startAt: string; endAt: string }>; selectedMoveSlot: string | null; actionError: string | null; actionMessage: string | null; isPending: boolean; onLoadMove: () => void; onSelectMoveSlot: (value: string) => void; onMove: () => void; onCancel: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-foreground/20" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-background p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="appointment-drawer-title"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-muted-foreground">{appointment.sourceLabel}</p><h2 id="appointment-drawer-title" className="mt-1 text-xl font-bold">{appointment.prospectName}</h2></div><button ref={closeRef} type="button" aria-label="Fermer la fiche" onClick={onClose} className="min-h-11 min-w-11 rounded-full border border-border text-xl hover:bg-muted">×</button></div><div className="mt-5 flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-muted/30 p-4 text-sm"><p><strong>Événement :</strong> {appointment.eventName}</p><p><strong>Horaire :</strong> {formatDay(appointment.startAt, timeZone)} · {formatTime(appointment.startAt, timeZone)} – {formatTime(appointment.endAt, timeZone)} ({timeZone})</p><p><strong>Closer :</strong> {appointment.closerName}</p><p><strong>Durée :</strong> {appointment.durationMinutes} minutes{appointment.durationEstimated ? " (estimation visuelle, source sans durée)" : ""}</p><p><strong>Email :</strong> {appointment.email || "Non renseigné"}</p><p><strong>Téléphone :</strong> {appointment.phone || "Non renseigné"}</p><p><strong>Statut :</strong> {STATUS_LABELS[appointment.status]}</p></div>{appointment.activities.length > 0 && <div className="mt-5"><h3 className="font-bold">Historique de la réservation</h3><ol className="mt-3 flex flex-col gap-3 border-l border-border pl-4">{[...appointment.activities].reverse().map((activity) => <li key={`${activity.kind}-${activity.createdAt}`} className="relative text-sm"><span className="absolute -left-[1.35rem] top-1.5 size-2 rounded-full bg-accent" aria-hidden="true" /><p className="font-bold">{activity.kind === "booked" ? `Réservation attribuée à ${activity.toCloserName || "un closer"}` : activity.kind === "cancelled" ? "Rendez-vous annulé" : "Rendez-vous déplacé"}</p>{activity.kind === "rescheduled" && <p className="mt-1 text-xs text-muted-foreground">{formatActivityTime(activity.fromStartAt, timeZone)} → {formatActivityTime(activity.toStartAt, timeZone)} · closer conservé : {activity.toCloserName || appointment.closerName}</p>}{activity.kind === "booked" && <p className="mt-1 text-xs text-muted-foreground">{formatActivityTime(activity.toStartAt, timeZone)}</p>}<p className="mt-1 text-[11px] text-muted-foreground">{formatActivityTime(activity.createdAt, timeZone)}</p></li>)}</ol></div>}{appointment.answers.length > 0 && <div className="mt-5"><h3 className="font-bold">Réponses de qualification</h3><dl className="mt-3 flex flex-col gap-3">{appointment.answers.map((answer) => <div key={answer.questionId}><dt className="text-xs font-bold text-muted-foreground">{answer.label}</dt><dd className="mt-1 text-sm">{Array.isArray(answer.answer) ? answer.answer.join(", ") || "—" : answer.answer || "—"}</dd></div>)}</dl></div>}{appointment.canManage && appointment.status === "confirmed" && <div className="mt-6 border-t border-border pt-5"><h3 className="font-bold">Actions natives</h3>{moving && <div className="mt-3"><p className="text-sm text-muted-foreground">Créneaux disponibles pour {appointment.closerName}.</p>{moveSlots.length === 0 && !actionError && <p className="mt-3 rounded-[var(--radius-control)] bg-muted p-3 text-sm text-muted-foreground">Aucun créneau trouvé pour ce closer.</p>}{moveSlots.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{moveSlots.map((slot) => <button key={slot.startAt} type="button" onClick={() => onSelectMoveSlot(slot.startAt)} className={`min-h-11 rounded-full border px-2 text-xs font-bold ${selectedMoveSlot === slot.startAt ? "border-accent bg-accent text-primary-foreground" : "border-border hover:border-accent"}`}>{formatDay(slot.startAt, timeZone)}<br />{formatTime(slot.startAt, timeZone)}</button>)}</div>}<Button type="button" disabled={!selectedMoveSlot || isPending} onClick={onMove} className="mt-4 w-full">{isPending ? "Déplacement…" : "Confirmer le déplacement"}</Button></div>}<div className="mt-4 flex flex-wrap gap-2">{!moving && <Button type="button" variant="outline" onClick={onLoadMove} className="min-h-11">Charger les créneaux</Button>}<button type="button" onClick={onCancel} disabled={isPending} className="min-h-11 text-sm font-bold text-state-critical underline">Annuler le rendez-vous</button></div><p className="mt-3 text-xs text-muted-foreground">Le closer reste inchangé. Le prospect reçoit la mise à jour par email.</p>{actionMessage && <p className="mt-3 rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg p-3 text-sm font-bold text-foreground" role="status">{actionMessage}</p>}{actionError && <p className="mt-3 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg p-3 text-sm font-bold text-state-critical" role="alert">{actionError}</p>}</div>}</div></div>;
}

function StatusBadge({ status }: { status: Appointment["status"] }) {
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status === "confirmed" ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : status === "cancelled" ? "border-state-critical/30 bg-state-critical-bg text-state-critical" : "border-border bg-muted text-muted-foreground"}`}>{STATUS_LABELS[status]}</span>;
}
