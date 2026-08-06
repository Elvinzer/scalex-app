import { CalendarPlus, ExternalLink, Link2 } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { getNativeBookingEntitlements, getNativeBookingUsage } from "@/lib/billing/plan-gate";
import { getCurrentUser } from "@/lib/current-user";
import { listNativeBookingLeads } from "@/lib/native-booking/leads";
import { listUnifiedAgendaAppointments } from "@/lib/native-booking/agenda";
import { listNativeBookingEvents } from "@/lib/native-booking/queries";
import { getAccountBookingHandle } from "@/lib/native-booking/handle";
import { agendaFiltersSchema } from "@/lib/native-booking/validation";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CreateEventForm } from "./create-event-form";
import { AbandonedLeadsPanel } from "./abandoned-leads-panel";
import { CopyLinkButton } from "./copy-link-button";
import { EventStatusButton } from "./event-status-button";
import { UnifiedAgenda } from "./unified-agenda";

function dateFromRange(range: "today" | "next7" | "next30" | "custom", from: string | null, to: string | null) {
  const now = new Date();
  if (range === "custom" && from && to) return { from: new Date(from), to: new Date(to) };
  const days = range === "today" ? 1 : range === "next30" ? 30 : 7;
  return { from: now, to: new Date(now.getTime() + days * 86_400_000) };
}

export default async function NativeBookingEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string; from?: string; calendar_error?: string; provider?: string; calendar?: string; view?: string; source?: string; closer?: string; status?: string; range?: string; to?: string; tz?: string }>;
}) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:rdv");
  const params = await searchParams;
  const fromDashboard = params.from === "dashboard";
  const targetLeadId = z.string().uuid().safeParse(params.lead).success ? params.lead ?? null : null;
  const requestedSources = params.source ? params.source.split(",") : ["native", "iclosed", "calendly"];
  const requestedClosers = params.closer ? params.closer.split(",") : [];
  const requestedStatuses = params.status === "all" ? ["confirmed", "cancelled", "past"] : params.status ? params.status.split(",") : ["confirmed"];
  const parsedFilters = agendaFiltersSchema.safeParse({
    view: params.view,
    source: requestedSources,
    closerIds: requestedClosers,
    status: requestedStatuses,
    range: params.range,
    from: params.from ?? null,
    to: params.to ?? null,
    timeZone: params.tz ?? "Europe/Paris",
  });
  const filters = parsedFilters.success ? parsedFilters.data : agendaFiltersSchema.parse({});
  const periodBounds = dateFromRange(filters.range, filters.from, filters.to);
  const calendarProvider = params.provider === "outlook" ? "Outlook" : "Google Calendar";
  const calendarErrorMessage = params.calendar_error === "not_configured"
    ? `La connexion ${calendarProvider} n'est pas encore configurée sur cet environnement.`
    : params.calendar_error === "oauth"
      ? `${calendarProvider} n'a pas pu terminer la connexion. Vérifie l'autorisation du compte puis réessaie.`
      : params.calendar_error === "denied"
        ? `La connexion ${calendarProvider} a été annulée. Tu peux réessayer quand tu veux.`
        : params.calendar_error === "state"
          ? `La tentative de connexion ${calendarProvider} a expiré. Relance la connexion depuis cet écran.`
          : params.calendar_error === "plan"
            ? "La connexion à un agenda externe n'est pas incluse dans ton abonnement actuel."
            : params.calendar_error === "provider"
              ? "Ce fournisseur de calendrier n'est pas reconnu."
              : null;
  const calendarConnected = params.calendar === "connected";

  const [events, entitlements, usage, leads, agendaAppointments, bookingHandle] = await Promise.all([
    listNativeBookingEvents(accountId),
    getNativeBookingEntitlements(accountId),
    getNativeBookingUsage(accountId),
    listNativeBookingLeads(accountId),
    listUnifiedAgendaAppointments(accountId, {
      from: periodBounds.from,
      to: periodBounds.to,
      sources: filters.source,
      closerIds: filters.closerIds,
      statuses: filters.status,
    }),
    getAccountBookingHandle(accountId),
  ]);
  // Un compte avec au moins un event a forcément un handle (posé à la création
  // du 1er event, backfillé pour l'existant) ; ce fallback ne sert que de garde-fou.
  const publicHandle = bookingHandle ?? "";

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
    email: lead.email,
    answers: lead.answers.map((answer) => ({ questionId: answer.questionId, label: answer.label, answer: answer.answer })),
  }));

  const agendaViews = agendaAppointments.map((appointment) => ({
    ...appointment,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    activities: appointment.activities.map((activity) => ({
      ...activity,
      fromStartAt: activity.fromStartAt?.toISOString() ?? null,
      fromEndAt: activity.fromEndAt?.toISOString() ?? null,
      toStartAt: activity.toStartAt?.toISOString() ?? null,
      toEndAt: activity.toEndAt?.toISOString() ?? null,
      createdAt: activity.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-accent-text">Troisième source d&apos;appels</p>
          <h2 className="mt-1 text-3xl font-bold">Rendez-vous</h2>
          <p className="mt-2 max-w-2xl text-foreground/70">
            Un agenda unique pour les réservations natives, iClosed et Calendly. Les appels manuels restent dans le journal détaillé.
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

      {calendarErrorMessage && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-4 py-3 text-sm font-bold text-state-critical" role="alert">
          {calendarErrorMessage}
        </div>
      )}
      {calendarConnected && (
        <div className="rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-4 py-3 text-sm font-bold text-state-healthy" role="status">
          Calendrier connecté. Tu peux maintenant choisir les agendas à prendre en compte.
        </div>
      )}

      <AbandonedLeadsPanel leads={leadViews} targetLeadId={targetLeadId} />
      <UnifiedAgenda
        appointments={agendaViews}
        filters={{
          view: filters.view,
          source: filters.source,
          closerIds: filters.closerIds,
          status: filters.status,
          range: filters.range,
          from: filters.from,
          to: filters.to,
          timeZone: filters.timeZone,
        }}
      />

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
                        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">/book/{publicHandle}/{event.slug}</p>
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
                        <a href={`/book/${publicHandle}/${event.slug}`} target="_blank" rel="noreferrer">
                          Voir la page <ExternalLink className="size-3.5" />
                        </a>
                      </Button>
                      <CopyLinkButton url={`/book/${publicHandle}/${event.slug}`} compact />
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
