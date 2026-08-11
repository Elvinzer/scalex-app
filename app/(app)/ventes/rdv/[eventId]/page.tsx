import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { teamMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { getNativeBookingViewer } from "@/lib/native-booking/access";
import { getNativeBookingEventDetail } from "@/lib/native-booking/queries";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";
import { generateBookingSlots } from "@/lib/native-booking/slots";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { and, eq, or } from "drizzle-orm";

import { EventStatusButton } from "../event-status-button";
import { CopyLinkButton } from "../copy-link-button";
import { BookingHandleEditor } from "./booking-handle-editor";
import { EventEditor } from "./event-editor";

export default async function NativeBookingEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const t = await getTranslations("app.booking.eventPage");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:rdv");
  const viewer = await getNativeBookingViewer(userId);
  if (!viewer) notFound();
  const { eventId } = await params;
  const detail = await getNativeBookingEventDetail(accountId, eventId, viewer);
  if (!detail) notFound();

  const bookingHandle = await ensureAccountBookingHandle(accountId);
  const publicUrl = `/book/${bookingHandle}/${detail.event.slug}`;

  if (!viewer.isAccountWide) {
    return (
      <div className="flex flex-col gap-6">
        <Button asChild variant="ghost" size="sm" className="w-fit"><Link href="/ventes/rdv"><ArrowLeft className="size-4" /> {t("back")}</Link></Button>
        <section className="sticker-card flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-sm font-bold text-accent">{t("update")}</p>
            <h1 className="mt-1 text-3xl font-bold">{detail.event.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("closerAccessHelp")}</p>
          </div>
          <div className="rounded-[var(--radius-control)] bg-muted p-4">
            <p className="text-xs font-bold text-muted-foreground">{t("publicLink")}</p>
            <p className="mt-1 break-all font-mono text-sm">{publicUrl}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm"><a href={publicUrl} target="_blank" rel="noreferrer">{t("openBookingLink")} <ExternalLink className="size-3.5" /></a></Button>
            <CopyLinkButton url={publicUrl} />
          </div>
        </section>
      </div>
    );
  }

  const candidates = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .leftJoin(
      teamMembers,
      and(eq(teamMembers.memberUserId, users.id), eq(teamMembers.accountId, accountId), eq(teamMembers.status, "active"))
    )
    .where(or(eq(users.id, accountId), eq(teamMembers.accountId, accountId)))
    .orderBy(users.displayName, users.email);

  const isReady = detail.availability.length > 0 && detail.closers.some(({ assignment }) => assignment.isActive && !assignment.isOff);
  const previewSlots = generateBookingSlots({
    event: detail.event,
    availability: detail.availability,
    exceptions: detail.exceptions,
    bookings: [],
    days: 14,
  }).slice(0, 6).map((slot) => slot.startAt.toISOString());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/ventes/rdv">
            <ArrowLeft className="size-4" /> {t("back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <EventStatusButton eventId={detail.event.id} status={detail.event.status} />
          <Button asChild size="sm" variant="outline">
            <a href={publicUrl} target="_blank" rel="noreferrer">
              {t("preview")} <ExternalLink className="size-3.5" />
            </a>
          </Button>
          <CopyLinkButton url={publicUrl} />
          <details className="relative">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted">
              {t("embed")}
            </summary>
            <div className="absolute right-0 top-11 z-10 w-80 rounded-[var(--radius-card)] border border-border bg-background p-3 shadow-lg">
              <p className="text-xs text-muted-foreground">{t("embedHelp")}</p>
              <code className="mt-2 block break-all rounded-[var(--radius-control)] bg-muted p-2 text-[11px]">{`<iframe src="${publicUrl}" title="${detail.event.name}" width="100%" height="760" frameborder="0"></iframe>`}</code>
            </div>
          </details>
        </div>
      </div>

      <BookingHandleEditor initialHandle={bookingHandle} />

      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-bold text-accent">{t("update")}</p>
          <h2 className="mt-1 text-3xl font-bold">{detail.event.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("updateHelp")}
          </p>
        </div>
        <div className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm font-bold ${isReady ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy" : "border-state-caution/30 bg-state-caution/10 text-state-caution"}`}>
          {isReady ? <CheckCircle2 className="mr-1.5 inline size-4" /> : <AlertCircle className="mr-1.5 inline size-4" />}
          {isReady ? t("ready") : t("incomplete")} · {detail.event.timeZone}
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
        }))}
        candidates={candidates}
        links={detail.links}
        publicUrl={publicUrl}
        previewSlots={previewSlots}
        questions={detail.questions.map((question) => ({
          id: question.id,
          type: question.type,
          label: question.label,
          helpText: question.helpText,
          isRequired: question.isRequired,
          options: question.options,
        }))}
        reminders={detail.reminders.map((reminder) => ({
          id: reminder.id,
          delayMinutes: reminder.delayMinutes,
          subject: reminder.subject,
          message: reminder.message,
          isActive: reminder.isActive,
        }))}
      />
    </div>
  );
}
