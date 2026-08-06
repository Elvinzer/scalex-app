"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { slugifyEventName } from "@/lib/native-booking/validation";

import { createNativeBookingEventAction } from "./actions";

export function CreateEventForm({ canCreate }: { canCreate: boolean }) {
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
        meetingLabel: String(form.get("meetingLabel") ?? "Appel stratégique"),
        meetingUrl: String(form.get("meetingUrl") ?? "").trim() || null,
        publicHeading: String(form.get("publicHeading") ?? "Réserve ton appel stratégique"),
        publicDescription: String(form.get("publicDescription") ?? "Choisis le créneau qui te convient le mieux."),
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
        Tu as atteint la limite d&apos;événements de ton abonnement. Passe au niveau supérieur pour en créer un nouveau.
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
            Créer un événement
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">Un formulaire simple pour commencer avec des horaires de semaine.</span>
        </span>
        <span className="text-sm font-bold text-accent-text">{isOpen ? "Fermer" : "Commencer"}</span>
      </button>

      {isOpen && (
        <form onSubmit={submit} className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Nom de l&apos;événement</span>
            <input name="name" required placeholder="Appel stratégique" className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Slug du lien</span>
            <input name="slug" placeholder="appel-strategique" className="booking-admin-input" />
            <span className="text-xs text-muted-foreground">Tu peux le laisser vide : il sera généré automatiquement.</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">Description</span>
            <textarea name="description" rows={2} placeholder="Ce que le prospect va obtenir pendant l'appel…" className="booking-admin-input resize-y" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Durée</span>
            <select name="durationMinutes" defaultValue="60" className="booking-admin-input">
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">1 heure</option>
              <option value="90">1 h 30</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Nom du rendez-vous</span>
            <input name="meetingLabel" defaultValue="Appel stratégique" className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">Lien de réunion (facultatif)</span>
            <input name="meetingUrl" type="url" placeholder="https://meet.google.com/..." className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">Titre visible par le prospect</span>
            <input name="publicHeading" defaultValue="Réserve ton appel stratégique" className="booking-admin-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="font-bold">Texte d&apos;introduction</span>
            <textarea name="publicDescription" rows={2} defaultValue="Choisis le créneau qui te convient le mieux." className="booking-admin-input resize-y" />
          </label>
          {error && <p className="text-sm font-bold text-state-critical sm:col-span-2" role="alert">{error}</p>}
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">Disponibilités initiales : lundi à vendredi, 09:00–17:00, dans ton fuseau détecté ({timeZone}).</p>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Création…" : "Créer l’événement"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
