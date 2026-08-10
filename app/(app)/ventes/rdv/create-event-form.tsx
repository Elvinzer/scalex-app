"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { slugifyEventName } from "@/lib/native-booking/validation";

import { createNativeBookingEventAction } from "./actions";

export function CreateEventForm({ canCreate }: { canCreate: boolean }) {
  const t = useTranslations("app.booking");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("Europe/Paris");

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) setTimeZone(detected);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    const name = String(form.get("name") ?? "").trim();
    startTransition(async () => {
      const result = await createNativeBookingEventAction({
        name,
        slug: slugifyEventName(String(form.get("slug") ?? "").trim() || name),
        description: String(form.get("description") ?? ""),
        durationMinutes: Number(form.get("durationMinutes") ?? 60),
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minNoticeMinutes: 60,
        bookingHorizonDays: 30,
        timeZone,
        meetingLabel: String(form.get("meetingLabel") ?? t("strategicCall")),
        meetingUrl: String(form.get("meetingUrl") ?? "").trim() || null,
        publicHeading: String(form.get("publicHeading") ?? t("publicHeadingDefault")),
        publicDescription: String(form.get("publicDescription") ?? t("publicDescriptionDefault")),
        requireContactBeforeSlots: true,
        roundRobinEnabled: true,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsOpen(false);
      router.push(`/ventes/rdv/${result.eventId}`);
      router.refresh();
    });
  }

  if (!canCreate) {
    return (
      <div className="rounded-[var(--radius-card)] border border-state-caution/30 bg-state-caution/10 p-4 text-sm text-state-caution">
        {t("limitReached")}
      </div>
    );
  }

  return (
    <section className="sticker-card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-muted/40"
        aria-expanded={isOpen}
      >
        <span>
          <span className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent/10 text-accent">+</span>
            {t("createEvent")}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{t("createEventHelp")}</span>
        </span>
        <span className="text-sm font-bold text-accent-text">{isOpen ? t("close") : t("start")}</span>
      </button>

      {isOpen && (
        <form onSubmit={submit} className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("eventName")}</span>
            <input name="name" required placeholder={t("strategicCall")} className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("linkSlug")}</span>
            <input name="slug" placeholder="appel-strategique" className="booking-admin-input" />
            <span className="text-xs text-muted-foreground">{t("slugHelp")}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">{t("description")}</span>
            <textarea name="description" rows={2} placeholder={t("descriptionPlaceholder")} className="booking-admin-input resize-y" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("duration")}</span>
            <select name="durationMinutes" defaultValue="60" className="booking-admin-input">
              <option value="30">{t("minutes", { count: 30 })}</option>
              <option value="45">{t("minutes", { count: 45 })}</option>
              <option value="60">{t("oneHour")}</option>
              <option value="90">{t("oneAndHalfHours")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("meetingName")}</span>
            <input name="meetingLabel" defaultValue={t("strategicCall")} className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">{t("meetingUrlOptional")}</span>
            <input name="meetingUrl" type="url" placeholder="https://meet.google.com/..." className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">{t("publicHeading")}</span>
            <input name="publicHeading" defaultValue={t("publicHeadingDefault")} className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">{t("publicDescription")}</span>
            <textarea name="publicDescription" rows={2} defaultValue={t("publicDescriptionDefault")} className="booking-admin-input resize-y" />
          </label>
          {error && <p className="text-sm font-bold text-state-critical sm:col-span-2" role="alert">{error}</p>}
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">{t("initialAvailability", { timeZone })}</p>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("creating") : t("createEvent")}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
