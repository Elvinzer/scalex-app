import { CalendarPlus, ExternalLink, Link2 } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getNativeBookingEntitlements, getNativeBookingUsage } from "@/lib/billing/plan-gate";
import { getCurrentUser } from "@/lib/current-user";
import { listNativeBookingLeads } from "@/lib/native-booking/leads";
import { listNativeBookingEvents, listUpcomingNativeBookings } from "@/lib/native-booking/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CreateEventForm } from "./create-event-form";
import { AbandonedLeadsPanel } from "./abandoned-leads-panel";
import { EventStatusButton } from "./event-status-button";
import { UpcomingBookingsPanel } from "./upcoming-bookings-panel";

const STATUS_LABELS = {
  draft: "Brouillon",
  active: "Actif",
  paused: "En pause",
  archived: "Archivé",
} as const;

export default async function NativeBookingEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; from?: string }>;
}) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:rdv");
  const params = await searchParams;
  const fromDashboard = params.from === "dashboard";
  const targetLeadId = z.string().uuid().safeParse(params.lead).success ? params.lead ?? null : null;

  const [events, entitlements, usage, leads, upcomingBookings] = await Promise.all([
    listNativeBookingEvents(accountId),
    getNativeBookingEntitlements(accountId),
    getNativeBookingUsage(accountId),
    listNativeBookingLeads(accountId),
    listUpcomingNativeBookings(accountId),
  ]);

  const leadViews = leads.map(({ lead, event }) => ({
    id: lead.id,
    status: lead.status as "open" | "contacted",
    firstName: lead.firstName,
    lastName: lead.lastName,
    phone: lead.phone,
    eventName: event.name,
    eventTimeZone: event.timeZone,
    lastStep: lead.lastStep,
    lastSeenAt: lead.lastSeenAt.toISOString(),
    selectedStartAt: lead.selectedStartAt?.toISOString() ?? null,
    utmSource: lead.utmSource,
    utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent,
  }));

  const bookingViews = upcomingBookings.map(({ booking, event, closer }) => ({
    id: booking.id,
    eventId: event.id,
    eventName: event.name,
    firstName: booking.firstName,
    lastName: booking.lastName,
    phone: booking.phone,
    closerName: closer?.displayName || closer?.email || "Closer non assigné",
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    timeZone: booking.eventTimeZone,
    status: booking.status as "confirmed" | "sync_failed",
    syncError: booking.syncError,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent">Troisième source d&apos;appels</p>
          <h2 className="mt-1 text-3xl font-bold">Rendez-vous</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Crée une page de réservation Scale X, collecte les coordonnées avant les créneaux et répartis les appels
            entre tes closers.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {fromDashboard && (
            <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-bold text-muted-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-accent/20">
              ← Retour au Dashboard
            </Link>
          )}
          <div className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-bold">
            <CalendarPlus className="size-4 text-accent" />
            {entitlements.maxEvents === null ? `${usage} événement${usage > 1 ? "s" : ""}` : `${usage}/${entitlements.maxEvents} événement${entitlements.maxEvents > 1 ? "s" : ""}`}
          </div>
        </div>
      </div>

      <AbandonedLeadsPanel leads={leadViews} targetLeadId={targetLeadId} />
      <UpcomingBookingsPanel bookings={bookingViews} />

      {!entitlements.enabled ? (
        <div className="sticker-card flex flex-col gap-4 p-6 sm:p-8">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
            <Link2 className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">La prise de rendez-vous native n&apos;est pas activée</h3>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Active cette capacité dans le plan d&apos;abonnement depuis l&apos;administration pour publier ton premier lien.
            </p>
          </div>
        </div>
      ) : (
        <>
          <CreateEventForm canCreate={entitlements.maxEvents === null || usage < entitlements.maxEvents} />

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">Tes événements</h3>
                <p className="text-sm text-muted-foreground">Chaque événement possède son lien, son fuseau et ses règles.</p>
              </div>
              <span className="text-sm font-bold text-muted-foreground">{events.length}</span>
            </div>

            {events.length === 0 ? (
              <div className="sticker-card-dashed flex flex-col items-center gap-3 p-8 text-center">
                <CalendarPlus className="size-8 text-muted-foreground" />
                <div>
                  <p className="font-bold">Aucun événement pour l&apos;instant</p>
                  <p className="mt-1 text-sm text-muted-foreground">Commence par créer ta première page de réservation.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {events.map((event) => (
                  <article key={event.id} className="sticker-card flex flex-col gap-5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-bold">{event.name}</p>
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">/book/{event.slug}</p>
                      </div>
                      <EventStatusButton eventId={event.id} status={event.status} />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {event.description || "Aucune description ajoutée pour le moment."}
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-[var(--radius-control)] bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground">Durée</p>
                        <p className="mt-1 font-bold">{event.durationMinutes} min</p>
                      </div>
                      <div className="rounded-[var(--radius-control)] bg-muted/60 p-3">
                        <p className="text-xs text-muted-foreground">Fuseau</p>
                        <p className="mt-1 truncate font-bold">{event.timeZone}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <Button asChild size="sm">
                        <Link href={`/ventes/rdv/${event.id}`}>
                          Configurer <ExternalLink className="size-3.5" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/book/${event.slug}`} target="_blank" rel="noreferrer">
                          Voir la page <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                      <span className="ml-auto text-xs font-bold text-muted-foreground">{STATUS_LABELS[event.status]}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
