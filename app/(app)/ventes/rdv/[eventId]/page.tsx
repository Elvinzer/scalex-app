import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { nativeCalendarConnections, teamMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { getNativeBookingEventDetail } from "@/lib/native-booking/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { and, eq, or } from "drizzle-orm";

import { EventStatusButton } from "../event-status-button";
import { CopyLinkButton } from "../copy-link-button";
import { EventEditor } from "./event-editor";

export default async function NativeBookingEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:rdv");
  const { eventId } = await params;
  const detail = await getNativeBookingEventDetail(accountId, eventId);
  if (!detail) notFound();

  const candidates = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.memberUserId, users.id), eq(teamMembers.accountId, accountId), eq(teamMembers.status, "active"))
    )
    .where(or(eq(users.id, accountId), eq(teamMembers.accountId, accountId)))
    .orderBy(users.displayName, users.email);

  const calendarRows = await db
    .select({
      closerUserId: nativeCalendarConnections.closerUserId,
      provider: nativeCalendarConnections.provider,
      email: nativeCalendarConnections.providerAccountEmail,
      status: nativeCalendarConnections.status,
    })
    .from(nativeCalendarConnections)
    .where(eq(nativeCalendarConnections.userId, accountId));

  const calendarsByCloser = new Map<string, typeof calendarRows>();
  for (const row of calendarRows) {
    const rows = calendarsByCloser.get(row.closerUserId) ?? [];
    rows.push(row);
    calendarsByCloser.set(row.closerUserId, rows);
  }

  const publicUrl = `/book/${detail.event.slug}`;
  const isReady = detail.availability.length > 0 && detail.closers.some(({ assignment }) => assignment.isActive && !assignment.isOff);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventes/rdv">
            <ArrowLeft className="size-4" /> Retour aux événements
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <EventStatusButton eventId={detail.event.id} status={detail.event.status} />
          <Button asChild size="sm" variant="outline">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              Aperçu public <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <CopyLinkButton url={publicUrl} />
          <details className="relative">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted">
              Intégrer
            </summary>
            <div className="absolute right-0 top-11 z-10 w-80 rounded-[var(--radius-card)] border border-border bg-background p-3 shadow-lg">
              <p className="text-xs text-muted-foreground">Colle ce code sur ta page de vente.</p>
              <code className="mt-2 block break-all rounded-[var(--radius-control)] bg-muted p-2 text-[11px]">{`<iframe src="${publicUrl}" title="${detail.event.name}" width="100%" height="760" frameborder="0"></iframe>`}</code>
            </div>
          </details>
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-bold text-accent">Mise à jour de l&apos;événement</p>
          <h2 className="mt-1 text-3xl font-bold">{detail.event.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Configure les horaires, les closers et la page qui qualifiera tes prospects avant de révéler les créneaux.
          </p>
        </div>
        <div className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm font-bold ${isReady ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : "border-state-caution/30 bg-state-caution/10 text-state-caution"}`}>
          {isReady ? <CheckCircle2 className="mr-1.5 inline size-4" /> : <AlertCircle className="mr-1.5 inline size-4" />}
          {isReady ? "Prêt à recevoir des réservations" : "Configuration à terminer"} · {detail.event.timeZone}
        </div>
      </header>

      <EventEditor
        event={detail.event}
        availability={detail.availability}
        exceptions={detail.exceptions}
        closers={detail.closers.map(({ assignment, user }) => ({
          id: assignment.closerUserId,
          name: user.displayName || user.email,
          email: user.email,
          isOff: assignment.isOff,
          isActive: assignment.isActive,
          calendars: calendarsByCloser.get(assignment.closerUserId) ?? [],
        }))}
        candidates={candidates}
        currentUserId={userId}
        links={detail.links}
        publicUrl={publicUrl}
      />
    </div>
  );
}
