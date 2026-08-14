"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronDown, ChevronUp, ExternalLink, GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NativeBookingWindow } from "@/db/schema";
import { getUnknownReminderVariables } from "@/lib/native-booking/validation";

import {
  addNativeBookingCloserAction,
  createNativeBookingLinkAction,
  deleteNativeBookingExceptionAction,
  saveNativeBookingAvailabilityAction,
  saveNativeBookingExceptionAction,
  rebalanceNativeBookingAction,
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

type QuestionDraft = {
  id?: string;
  type: "radio" | "checkbox" | "text" | "textarea" | "select";
  label: string;
  helpText: string | null;
  isRequired: boolean;
  options: string[];
};
type ReminderDraft = {
  id?: string;
  delayMinutes: number;
  subject: string;
  message: string;
  isActive: boolean;
};

type AvailabilityRow = { weekday: number; startTime: string; endTime: string };
type TimeWindowDraft = { startTime: string; endTime: string };
type DayDraft = { enabled: boolean; windows: TimeWindowDraft[] };
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
  [1, "monday"],
  [2, "tuesday"],
  [3, "wednesday"],
  [4, "thursday"],
  [5, "friday"],
  [6, "saturday"],
  [0, "sunday"],
] as const;

const REMINDER_VARIABLES = [
  ["firstName", "firstName"],
  ["eventName", "eventName"],
  ["date", "date"],
  ["time", "time"],
  ["timeZone", "timeZone"],
  ["meetingUrl", "meetingUrl"],
  ["managementUrl", "managementUrl"],
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

function formatPreviewSlot(value: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

type ReminderVariable = (typeof REMINDER_VARIABLES)[number][0];

function renderReminderPreview(value: string, previewValues: Record<ReminderVariable, string>): string {
  return value.replace(/{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g, (match, variable: string) => previewValues[variable as ReminderVariable] ?? match);
}

function questionDraftError(question: QuestionDraft): "errorLabel" | "errorOptionRequired" | "errorOptionsUnique" | "errorNoOptions" | null {
  if (!question.label.trim()) return "errorLabel";
  if (["radio", "checkbox", "select"].includes(question.type) && question.options.length === 0) return "errorOptionRequired";
  if (new Set(question.options.map((option) => option.trim().toLowerCase())).size !== question.options.length) return "errorOptionsUnique";
  if (!["radio", "checkbox", "select"].includes(question.type) && question.options.length > 0) return "errorNoOptions";
  return null;
}

function QuestionPreview({ questions }: { questions: QuestionDraft[] }) {
  const t = useTranslations("app.booking.editor");
  return (
    <div className="mt-5 rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/40 p-4" aria-label={t("questionPreview")}>
      <p className="text-sm font-bold">{t("preview")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("previewHelp")}</p>
      <div className="pointer-events-none mt-4 flex flex-col gap-4">
        {questions.map((question, index) => (
          <div key={question.id ?? `preview-${index}`} className="flex flex-col gap-1.5">
            <p className="text-sm font-bold">{question.label || t("questionWithoutLabel")}{question.isRequired ? <span className="ml-1 text-accent">*</span> : <span className="ml-1 font-normal text-muted-foreground">({t("optional")})</span>}</p>
            {question.helpText && <p className="text-xs text-muted-foreground">{question.helpText}</p>}
            {["radio", "checkbox"].includes(question.type) ? (
              <div className="flex flex-col gap-2">{question.options.map((option) => <div key={option} className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm"><span className="size-4 rounded-full border border-border" aria-hidden="true" />{option}</div>)}</div>
            ) : question.type === "select" ? (
              <div className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-muted-foreground">{t("selectAnswer")}</div>
            ) : question.type === "textarea" ? (
              <div className="min-h-20 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm text-muted-foreground">{t("yourAnswer")}</div>
            ) : (
              <div className="flex min-h-11 items-center rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm text-muted-foreground">{t("yourAnswer")}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReminderVariables({ onInsert }: { onInsert: (variable: string) => void }) {
  const t = useTranslations("app.booking.editor");
  return <span className="text-xs leading-6 text-muted-foreground">{t("variables")}: {REMINDER_VARIABLES.map(([token, label], index) => <span key={token}>{index > 0 && " · "}<button type="button" onClick={() => onInsert(token)} className="font-mono text-accent underline">{t(`variableLabels.${label}`)}</button></span>)}</span>;
}

export function EventEditor({
  event,
  defaultCloserId,
  availability,
  exceptions,
  closers,
  candidates,
  links,
  publicUrl,
  previewSlots,
  questions,
  reminders,
}: {
  event: EventData;
  defaultCloserId: string;
  availability: AvailabilityRow[];
  exceptions: Array<{ date: string; type: "closed" | "custom"; windows: NativeBookingWindow[]; reason: string | null }>;
  closers: Array<{ id: string; name: string; email: string; isOff: boolean; isActive: boolean }>;
  candidates: Array<{ id: string; displayName: string | null; email: string }>;
  links: BookingLinkSummary[];
  publicUrl: string;
  previewSlots: string[];
  questions: QuestionDraft[];
  reminders: ReminderDraft[];
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("app.booking.editor");
  const reminderPreviewValues: Record<ReminderVariable, string> = {
    firstName: t("previewFirstName"),
    eventName: t("previewEventName"),
    date: t("previewDate"),
    time: "14:00",
    timeZone: "Europe/Paris",
    meetingUrl: "https://example.test/join",
    managementUrl: "https://example.test/manage",
  };
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [days, setDays] = useState(() => initialDays(availability));
  const [exceptionDate, setExceptionDate] = useState("");
  const [exceptionType, setExceptionType] = useState<"closed" | "custom">("closed");
  const [exceptionWindows, setExceptionWindows] = useState<TimeWindowDraft[]>([{ startTime: "09:00", endTime: "17:00" }]);
  const [exceptionReason, setExceptionReason] = useState("");
  const [selectedCloser, setSelectedCloser] = useState(() => {
    const assignedIds = new Set(closers.map((closer) => closer.id));
    const available = candidates.filter((candidate) => !assignedIds.has(candidate.id));
    return available.find((candidate) => candidate.id === defaultCloserId)?.id ?? available[0]?.id ?? "";
  });
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>(questions);
  const [reminderDrafts, setReminderDrafts] = useState<ReminderDraft[]>(reminders);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState<number | null>(null);

  const assignedIds = useMemo(() => new Set(closers.map((closer) => closer.id)), [closers]);
  const availableCandidates = candidates.filter((candidate) => !assignedIds.has(candidate.id));

  useEffect(() => {
    function warnBeforeExit(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeExit);
    return () => window.removeEventListener("beforeunload", warnBeforeExit);
  }, [hasUnsavedChanges]);

  function run(action: () => Promise<{ error: string | null }>, success: string, onSuccess?: () => void) {
    setError(null);
    setSaved(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        setSaved(success);
        onSuccess?.();
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
          meetingLabel: String(form.get("meetingLabel") ?? t("meetingName")),
          meetingUrl: String(form.get("meetingUrl") ?? "").trim() || null,
          publicHeading: String(form.get("publicHeading") ?? ""),
          publicDescription: String(form.get("publicDescription") ?? ""),
          confirmationTitle: String(form.get("confirmationTitle") ?? t("confirmation")),
          confirmationMessage: String(form.get("confirmationMessage") ?? ""),
          bookingInstructions: String(form.get("bookingInstructions") ?? ""),
          notifyCloserOnBooking: form.get("notifyCloserOnBooking") === "on",
          notifyCloserOnCancellation: form.get("notifyCloserOnCancellation") === "on",
          notifyCloserOnReschedule: form.get("notifyCloserOnReschedule") === "on",
          requireContactBeforeSlots: true,
          roundRobinEnabled: true,
          questions: questionDrafts,
          reminders: reminderDrafts,
        }),
      t("savedDetails"),
      () => setHasUnsavedChanges(false)
    );
  }

  function markConfigurationDirty() {
    setHasUnsavedChanges(true);
    setSaved(null);
  }

  function addQuestion() {
    setQuestionDrafts((current) => [...current, { id: crypto.randomUUID(), type: "text", label: "", helpText: null, isRequired: false, options: [] }]);
    markConfigurationDirty();
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    setQuestionDrafts((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(nextIndex, 0, item);
      return next;
    });
    markConfigurationDirty();
  }

  function dropQuestion(index: number) {
    if (draggedQuestionIndex === null || draggedQuestionIndex === index) {
      setDraggedQuestionIndex(null);
      return;
    }
    setQuestionDrafts((current) => {
      const next = [...current];
      const [item] = next.splice(draggedQuestionIndex, 1);
      if (item) next.splice(index, 0, item);
      return next;
    });
    setDraggedQuestionIndex(null);
    markConfigurationDirty();
  }

  function addReminder() {
    setReminderDrafts((current) => [...current, { id: crypto.randomUUID(), delayMinutes: 60, subject: t("reminderDefaultSubject"), message: t("reminderDefaultMessage"), isActive: true }]);
    markConfigurationDirty();
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestionDrafts((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...patch } : question));
    markConfigurationDirty();
  }

  function updateReminder(index: number, patch: Partial<ReminderDraft>) {
    setReminderDrafts((current) => current.map((reminder, reminderIndex) => reminderIndex === index ? { ...reminder, ...patch } : reminder));
    markConfigurationDirty();
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
      t("availabilitySaved"),
      () => setHasUnsavedChanges(false)
    );
  }

  function addException() {
    if (!exceptionDate) {
      setError(t("chooseExceptionDate"));
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
      t("exceptionAdded")
    );
    setExceptionDate("");
    setExceptionType("closed");
    setExceptionWindows([{ startTime: "09:00", endTime: "17:00" }]);
    setExceptionReason("");
  }

  function deleteException(date: string) {
    run(
      () => deleteNativeBookingExceptionAction({ eventId: event.id, date }),
      t("exceptionDeleted")
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
      t("utmCreated")
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
      link.isActive ? t("linkDisabled") : t("linkReactivated")
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <div className="flex flex-col gap-5">
        <section className="sticker-card p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-lg font-bold">{t("eventDetails")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("eventDetailsHelp")}</p>
          </div>
          <form
            onChange={markConfigurationDirty}
            onSubmit={(event) => {
              event.preventDefault();
              saveDetails(new FormData(event.currentTarget));
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("name")}</span>
              <input name="name" defaultValue={event.name} required className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("publicSlug")}</span>
              <input name="slug" defaultValue={event.slug} required className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">{t("internalDescription")}</span>
              <textarea name="description" defaultValue={event.description} rows={2} className="booking-admin-input resize-y" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("durationMinutes")}</span>
              <input name="durationMinutes" type="number" min={15} max={240} defaultValue={event.durationMinutes} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("eventTimeZone")}</span>
              <input name="timeZone" defaultValue={event.timeZone} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("minimumNotice")}</span>
              <input name="minNoticeMinutes" type="number" min={0} max={10080} defaultValue={event.minNoticeMinutes} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("horizon")}</span>
              <input name="bookingHorizonDays" type="number" min={1} max={365} defaultValue={event.bookingHorizonDays} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("meetingName")}</span>
              <input name="meetingLabel" defaultValue={event.meetingLabel} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("meetingLink")}</span>
              <input name="meetingUrl" type="url" defaultValue={event.meetingUrl ?? ""} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">{t("publicTitle")}</span>
              <input name="publicHeading" defaultValue={event.publicHeading} className="booking-admin-input" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="font-bold">{t("publicIntroduction")}</span>
              <textarea name="publicDescription" defaultValue={event.publicDescription} rows={2} className="booking-admin-input resize-y" />
            </label>
            <div className="sm:col-span-2 rounded-[var(--radius-card)] border border-border bg-muted/40 p-4">
              <p className="font-bold">{t("notificationsTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("notificationsHelp")}</p>
              <div className="mt-3 grid gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">{t("confirmationTitle")}</span>
                  <input name="confirmationTitle" defaultValue={event.confirmationTitle} className="booking-admin-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">{t("confirmationMessage")}</span>
                  <textarea name="confirmationMessage" defaultValue={event.confirmationMessage} rows={2} className="booking-admin-input resize-y" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-bold">{t("beforeCallInstructions")}</span>
                  <textarea name="bookingInstructions" defaultValue={event.bookingInstructions} rows={3} placeholder={t("beforeCallPlaceholder")} className="booking-admin-input resize-y" />
                </label>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnBooking" defaultChecked={event.notifyCloserOnBooking} className="mt-0.5" />
                    <span>{t("confirmation")}</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnCancellation" defaultChecked={event.notifyCloserOnCancellation} className="mt-0.5" />
                    <span>{t("cancellation")}</span>
                  </label>
                  <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border bg-background/70 p-3">
                    <input type="checkbox" name="notifyCloserOnReschedule" defaultChecked={event.notifyCloserOnReschedule} className="mt-0.5" />
                    <span>{t("reschedule")}</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:col-span-2">
              <p className="text-xs text-muted-foreground">{t("coordinatesRequired")}</p>
              <Button type="submit" disabled={isPending}>{isPending ? t("saving") : t("save")}</Button>
            </div>
          </form>
        </section>

        <section className="sticker-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{t("qualificationTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("qualificationHelp")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addQuestion}><Plus className="size-4" /> {t("addQuestion")}</Button>
          </div>
          {questionDrafts.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">{t("noQuestions")}</div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {questionDrafts.map((question, index) => {
                const draftError = questionDraftError(question);
                return <article key={question.id ?? index} draggable onDragStart={() => setDraggedQuestionIndex(index)} onDragOver={(dragEvent) => dragEvent.preventDefault()} onDrop={(dragEvent) => { dragEvent.preventDefault(); dropQuestion(index); }} className={`rounded-[var(--radius-card)] border border-border bg-muted/20 p-4 ${draggedQuestionIndex === index ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <button type="button" aria-label={t("moveQuestion", { number: index + 1 })} className="mt-1 cursor-grab rounded-[var(--radius-control)] p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing" onDragStart={() => setDraggedQuestionIndex(index)}><GripVertical className="size-4" aria-hidden="true" /></button>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
                      <label className="flex flex-col gap-1.5 text-sm"><span className="font-bold">{t("label")}</span><input aria-invalid={Boolean(draftError && !question.label.trim())} value={question.label} onChange={(input) => updateQuestion(index, { label: input.target.value })} className="booking-admin-input" placeholder={t("questionPlaceholder")} /></label>
                      <label className="flex flex-col gap-1.5 text-sm"><span className="font-bold">{t("type")}</span><select value={question.type} onChange={(input) => updateQuestion(index, { type: input.target.value as QuestionDraft["type"], options: ["radio", "checkbox", "select"].includes(input.target.value) ? question.options : [] })} className="booking-admin-input"><option value="radio">{t("singleChoice")}</option><option value="checkbox">{t("multipleChoice")}</option><option value="select">{t("dropdown")}</option><option value="text">{t("shortText")}</option><option value="textarea">{t("longText")}</option></select></label>
                      <label className="flex flex-col gap-1.5 text-sm sm:col-span-2"><span className="font-bold">{t("helpOptional")}</span><input value={question.helpText ?? ""} onChange={(input) => updateQuestion(index, { helpText: input.target.value || null })} className="booking-admin-input" placeholder={t("helpPlaceholder")} /></label>
                      {["radio", "checkbox", "select"].includes(question.type) && <label className="flex flex-col gap-1.5 text-sm sm:col-span-2"><span className="font-bold">{t("options")} <span className="font-normal text-muted-foreground">{t("onePerLine")}</span></span><textarea aria-invalid={Boolean(draftError && (question.options.length === 0 || new Set(question.options.map((option) => option.trim().toLowerCase())).size !== question.options.length))} value={question.options.join("\n")} onChange={(input) => updateQuestion(index, { options: input.target.value.split("\n").map((option) => option.trim()).filter(Boolean) })} rows={3} className="booking-admin-input resize-y" placeholder={t("optionsPlaceholder")} /></label>}
                      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={question.isRequired} onChange={(input) => updateQuestion(index, { isRequired: input.target.checked })} /><span>{t("requiredAnswer")}</span></label>
                      {draftError && <p className="text-xs font-bold text-state-critical" role="alert">{t(draftError)}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button type="button" aria-label={t("moveUp")} disabled={index === 0} onClick={() => moveQuestion(index, -1)} className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronUp className="size-4" /></button>
                      <button type="button" aria-label={t("moveDown")} disabled={index === questionDrafts.length - 1} onClick={() => moveQuestion(index, 1)} className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted disabled:opacity-30"><ChevronDown className="size-4" /></button>
                      <button type="button" aria-label={t("deleteQuestion")} onClick={() => { setQuestionDrafts((current) => current.filter((_, questionIndex) => questionIndex !== index)); markConfigurationDirty(); }} className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted hover:text-state-critical"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                </article>;
              })}
            </div>
          )}
          {questionDrafts.length > 0 && <QuestionPreview questions={questionDrafts} />}
        </section>

        <section className="sticker-card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{t("remindersTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("remindersHelp")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addReminder}><Plus className="size-4" /> {t("addReminder")}</Button>
          </div>
          {reminderDrafts.length === 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">{t("noReminders")}</div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {reminderDrafts.map((reminder, index) => {
                const unknownVariables = Array.from(new Set([...getUnknownReminderVariables(reminder.subject), ...getUnknownReminderVariables(reminder.message)]));
                return <article key={reminder.id ?? index} className="rounded-[var(--radius-card)] border border-border bg-muted/20 p-4">
                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-bold">{t("reminderDelay")}</span>
                      <div className="flex items-center gap-2">
                        <input type="number" min={1} value={reminder.delayMinutes} onChange={(input) => updateReminder(index, { delayMinutes: Number(input.target.value) })} className="booking-admin-input w-28" />
                        <span className="text-xs text-muted-foreground">{t("minutes")}</span>
                      </div>
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm">
                      <span className="font-bold">{t("subject")}</span>
                      <input value={reminder.subject} onChange={(input) => updateReminder(index, { subject: input.target.value })} className="booking-admin-input" />
                      <ReminderVariables onInsert={(variable) => updateReminder(index, { subject: `${reminder.subject} {{${variable}}}` })} />
                    </label>
                    <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                      <span className="font-bold">{t("message")}</span>
                      <textarea value={reminder.message} onChange={(input) => updateReminder(index, { message: input.target.value })} rows={4} className="booking-admin-input resize-y" />
                      <ReminderVariables onInsert={(variable) => updateReminder(index, { message: `${reminder.message} {{${variable}}}` })} />
                    </label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={reminder.isActive} onChange={(input) => updateReminder(index, { isActive: input.target.checked })} /><span>{t("activeReminder")}</span></label>
                  </div>
                  {unknownVariables.length > 0 && <p className="mt-3 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-xs font-bold text-state-critical" role="alert">{t("unknownVariable", { variables: unknownVariables.join(", ") })}</p>}
                  <div className="mt-3 rounded-[var(--radius-control)] border border-border bg-background/70 p-3 text-sm">
                    <p className="text-xs font-bold text-muted-foreground">{t("samplePreview")}</p>
                    <p className="mt-2 font-bold">{renderReminderPreview(reminder.subject, reminderPreviewValues)}</p>
                    <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{renderReminderPreview(reminder.message, reminderPreviewValues)}</p>
                  </div>
                  <div className="mt-3 flex justify-end border-t border-border pt-3">
                    <button type="button" onClick={() => { setReminderDrafts((current) => current.filter((_, reminderIndex) => reminderIndex !== index)); markConfigurationDirty(); }} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-state-critical hover:underline"><Trash2 className="size-4" /> {t("delete")}</button>
                  </div>
                </article>;
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">{t("reminderHelp")}</p>
        </section>

        <section className="sticker-card p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-lg font-bold">{t("availabilityTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("availabilityHelp")}</p>
            </div>
            <Button type="button" size="sm" onClick={saveAvailability} disabled={isPending}>{t("saveHours")}</Button>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {WEEKDAYS.map(([weekday, label]) => (
              <div key={weekday} className="grid gap-3 py-3 sm:grid-cols-[minmax(120px,160px)_minmax(0,1fr)] sm:items-start">
                <label className="flex items-center gap-2 pt-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={days[weekday].enabled}
                    onChange={(input) => {
                      setDays((current) => ({ ...current, [weekday]: { ...current[weekday], enabled: input.target.checked } }));
                      markConfigurationDirty();
                    }}
                  />
                  {t(`weekdays.${label}`)}
                </label>
                <div className="flex flex-col gap-2">
                  {days[weekday].windows.map((window, windowIndex) => (
                    <div key={`${weekday}-${windowIndex}`} className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={`${t(`weekdays.${label}`)} ${windowIndex + 1}`}
                        type="time"
                        value={window.startTime}
                        disabled={!days[weekday].enabled}
                        onChange={(input) => {
                          setDays((current) => ({
                              ...current,
                              [weekday]: {
                                ...current[weekday],
                                windows: current[weekday].windows.map((item, index) =>
                                  index === windowIndex ? { ...item, startTime: input.target.value } : item
                                ),
                              },
                            }));
                          markConfigurationDirty();
                        }}
                        className="booking-admin-input w-32"
                      />
                      <span className="text-sm text-muted-foreground">{t("fromTo")}</span>
                      <input
                        aria-label={`${t(`weekdays.${label}`)} ${windowIndex + 1}`}
                        type="time"
                        value={window.endTime}
                        disabled={!days[weekday].enabled}
                        onChange={(input) => {
                          setDays((current) => ({
                              ...current,
                              [weekday]: {
                                ...current[weekday],
                                windows: current[weekday].windows.map((item, index) =>
                                  index === windowIndex ? { ...item, endTime: input.target.value } : item
                                ),
                              },
                            }));
                          markConfigurationDirty();
                        }}
                        className="booking-admin-input w-32"
                      />
                      <button
                        type="button"
                        aria-label={t("deleteWindow", { number: windowIndex + 1, day: t(`weekdays.${label}`) })}
                        disabled={!days[weekday].enabled || days[weekday].windows.length === 1}
                        onClick={() => {
                          setDays((current) => ({
                              ...current,
                              [weekday]: {
                                ...current[weekday],
                                windows: current[weekday].windows.filter((_, index) => index !== windowIndex),
                              },
                            }));
                          markConfigurationDirty();
                        }}
                        className="rounded-[var(--radius-control)] p-2 text-muted-foreground hover:bg-muted hover:text-state-critical disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={!days[weekday].enabled || days[weekday].windows.length >= 4}
                    onClick={() => {
                      setDays((current) => ({
                          ...current,
                          [weekday]: {
                            ...current[weekday],
                            windows: [...current[weekday].windows, { startTime: "13:00", endTime: "17:00" }],
                          },
                        }));
                      markConfigurationDirty();
                    }}
                    className="inline-flex w-fit items-center gap-1.5 text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="size-3.5" /> {t("addWindow")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-border pt-5">
            <p className="font-bold">{t("dateExceptions")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[auto_minmax(150px,0.7fr)_minmax(0,1fr)_auto]">
              <input type="date" value={exceptionDate} onChange={(input) => setExceptionDate(input.target.value)} className="booking-admin-input" aria-label={t("unavailableDate")} />
              <select value={exceptionType} onChange={(input) => setExceptionType(input.target.value as "closed" | "custom")} className="booking-admin-input" aria-label={t("exceptionType")}>
                <option value="closed">{t("closedDay")}</option>
                <option value="custom">{t("customHours")}</option>
              </select>
              <input value={exceptionReason} onChange={(input) => setExceptionReason(input.target.value)} placeholder={t("reasonOptional")} className="booking-admin-input" />
              <Button type="button" variant="outline" onClick={addException} disabled={isPending}>{t("addUnavailable")}</Button>
            </div>
            {exceptionType === "custom" && (
              <div className="mt-3 flex flex-col gap-2 rounded-[var(--radius-control)] bg-muted/50 p-3">
                <p className="text-xs font-bold text-muted-foreground">{t("openWindows")}</p>
                {exceptionWindows.map((window, windowIndex) => (
                  <div key={`exception-${windowIndex}`} className="flex flex-wrap items-center gap-2">
                    <input
                      aria-label={`${t("openWindows")} ${windowIndex + 1}`}
                      type="time"
                      value={window.startTime}
                      onChange={(input) => setExceptionWindows((current) => current.map((item, index) => index === windowIndex ? { ...item, startTime: input.target.value } : item))}
                      className="booking-admin-input w-32"
                    />
                    <span className="text-sm text-muted-foreground">{t("fromTo")}</span>
                    <input
                      aria-label={`${t("openWindows")} ${windowIndex + 1}`}
                      type="time"
                      value={window.endTime}
                      onChange={(input) => setExceptionWindows((current) => current.map((item, index) => index === windowIndex ? { ...item, endTime: input.target.value } : item))}
                      className="booking-admin-input w-32"
                    />
                    <button
                      type="button"
                      aria-label={t("deleteExceptionWindow", { number: windowIndex + 1 })}
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
                  <Plus className="size-3.5" /> {t("addWindow")}
                </button>
              </div>
            )}
            {exceptions.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {exceptions.map((exception) => (
                  <li key={exception.date} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-muted px-3 py-2">
                    <div className="min-w-0">
                      <p className="font-bold">{exception.date} · {exception.type === "custom" ? t("customHours") : t("closedDay")}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {exception.type === "custom" ? exception.windows.map((window) => `${window.startTime}–${window.endTime}`).join(" · ") : t("noSlots")}
                        {exception.reason ? ` · ${exception.reason}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={t("deleteException", { date: exception.date })}
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
            <p className="font-bold">{t("nextSlots")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("nextSlotsHelp")}</p>
            {previewSlots.length > 0 ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {previewSlots.map((slot) => (
                  <div key={slot} className="rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm font-bold">
                    {formatPreviewSlot(slot, event.timeZone, locale)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-sm text-muted-foreground">{t("noGeneratedSlots")}</p>
            )}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-5">
        <section className="sticker-card p-5">
          <p className="text-lg font-bold">{t("closers")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("closersHelp")}</p>
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
                        closer.isOff ? t("closerOnline") : t("closerOff")
                      )
                    }
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${closer.isOff ? "border-state-caution/30 bg-state-caution/10 text-state-caution" : "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"}`}
                  >
                    {closer.isOff ? t("off") : t("online")}
                  </button>
                </div>
                <div className="rounded-[var(--radius-control)] bg-muted/50 p-2.5 text-xs">
                  <p className="flex items-center gap-1.5 font-bold">
                    <CalendarDays className="size-3.5 text-accent" />
                    {t("externalCalendar")}
                  </p>
                  <p className="mt-1 text-muted-foreground">{t("calendarSettingsHelp")}</p>
                  <Button asChild type="button" size="sm" variant="outline" className="mt-3">
                    <Link href="/settings/calendars">{t("calendarSettingsLink")} <ExternalLink className="size-3" /></Link>
                  </Button>
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
                onClick={() => run(() => addNativeBookingCloserAction({ eventId: event.id, closerUserId: selectedCloser }), t("closerAdded"))}
              >
                {t("add")}
              </Button>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="max-w-sm text-xs text-muted-foreground">{t("rebalanceHelp")}</p>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => run(() => rebalanceNativeBookingAction({ eventId: event.id }), t("rebalanced"))}
            >
              {t("rebalance")}
            </Button>
          </div>
        </section>

        <section className="sticker-card border-accent/30 bg-accent-soft p-5">
          <p className="text-lg font-bold">{t("captureTitle")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("captureHelp")}</p>
          <div className="mt-4 rounded-[var(--radius-control)] bg-background/70 p-3 text-sm">
            <p className="font-bold">{t("publicLink")}</p>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{publicUrl}</p>
          </div>
        </section>

        <section className="sticker-card p-5">
          <div>
            <p className="text-lg font-bold">{t("sourceLinks")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("sourceLinksHelp")}</p>
          </div>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(formEvent) => {
              formEvent.preventDefault();
              createLink(new FormData(formEvent.currentTarget));
              formEvent.currentTarget.reset();
            }}
          >
            <input name="label" required placeholder={t("linkNamePlaceholder")} className="booking-admin-input" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="platform" defaultValue="youtube" className="booking-admin-input">
                <option value="youtube">YouTube</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="skool">Skool</option>
                <option value="other">{t("other")}</option>
              </select>
              <input name="contentLabel" placeholder={t("contentPlaceholder")} className="booking-admin-input" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="utmSource" placeholder="utm_source · youtube" className="booking-admin-input" />
              <input name="utmMedium" placeholder="utm_medium · video" className="booking-admin-input" />
              <input name="utmCampaign" placeholder="utm_campaign · lancement" className="booking-admin-input" />
              <input name="utmContent" placeholder="utm_content · video-12" className="booking-admin-input" />
              <input name="utmTerm" placeholder="utm_term · optionnel" className="booking-admin-input sm:col-span-2" />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>{t("createUtm")}</Button>
          </form>
          {links.length > 0 && (
            <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
              {links.map((link) => (
                <div key={link.id} className={`rounded-[var(--radius-control)] p-3 ${link.isActive ? "bg-muted/60" : "bg-muted/30 opacity-75"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{link.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{link.platform}{link.contentLabel ? ` · ${link.contentLabel}` : ""} · {link.isActive ? t("active") : t("disabled")}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button type="button" disabled={!link.isActive} onClick={() => copyLink(link)} className="text-xs font-bold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40">
                        {copiedLinkId === link.id ? t("copied") : t("copy")}
                      </button>
                      <button type="button" disabled={isPending} onClick={() => toggleLink(link)} className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40">
                        {link.isActive ? t("deactivate") : t("reactivate")}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{link.utmSource || t("utmSourceUndefined")} · {link.utmContent || t("contentUndefined")}</p>
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
