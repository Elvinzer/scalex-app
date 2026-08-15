import type { Metadata } from "next";
import { ArrowLeft, ExternalLink, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { SupportAdminControls } from "@/components/support/support-admin-controls";
import { SupportPriorityBadge, SupportStatusBadge } from "@/components/support/status-badge";
import { getAdminSupportTicketDetail, getSupportStaffMembers } from "@/lib/support/queries";
import { SUPPORT_CAPTURE_BUCKET } from "@/lib/support/storage";
import { requireStaffPermission } from "@/lib/staff/permissions";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { supportTicketIdSchema } from "@/lib/support/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: `${t("admin.detail.title")} | Minaly`, robots: { index: false, follow: false } };
}

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function valueOrFallback(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  await requireStaffPermission();
  const { ticketId } = await params;
  if (!supportTicketIdSchema.safeParse(ticketId).success) notFound();
  const [detail, staff, locale] = await Promise.all([
    getAdminSupportTicketDetail(ticketId),
    getSupportStaffMembers(),
    getLocale(),
  ]);
  if (!detail) notFound();
  const t = await getTranslations("support");
  const signedAttachments = await Promise.all(detail.attachments.map(async (attachment) => {
    const result = await getSupabaseAdminClient().storage.from(SUPPORT_CAPTURE_BUCKET).createSignedUrl(attachment.storagePath, 5 * 60);
    return result.data?.signedUrl ? { id: attachment.id, mimeType: attachment.mimeType, url: result.data.signedUrl } : null;
  }));
  const context = detail.ticket.context;
  const detailValues = [
    [t("ticket.expected"), detail.ticket.details.expectedResult],
    [t("ticket.observed"), detail.ticket.details.observedResult],
    [t("ticket.steps"), detail.ticket.details.reproductionSteps],
    [t("ticket.impact"), detail.ticket.details.impact],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <Link href="/admin/support" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2"><ArrowLeft className="size-4" /> {t("ticket.back")}</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0"><p className="text-xs font-bold tracking-[0.1em] text-muted-foreground uppercase">{detail.ticket.reference}</p><h1 className="mt-2 text-[clamp(1.5rem,4vw,2.25rem)] leading-[1.1] font-bold tracking-[-0.03em]">{detail.ticket.title}</h1><p className="mt-2 text-sm text-muted-foreground">{t(`form.type.${detail.ticket.type}`)} · {t("admin.detail.created")} {formatDate(detail.ticket.createdAt, locale)}</p></div><div className="flex flex-wrap items-center gap-2"><SupportPriorityBadge priority={detail.ticket.priority} /><SupportStatusBadge status={detail.ticket.status} /></div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <div className="space-y-5">
          <section className="sticker-card p-5 sm:p-7" aria-labelledby="admin-ticket-description"><h2 id="admin-ticket-description" className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("ticket.description")}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{detail.ticket.description}</p>{detailValues.length > 0 && <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">{detailValues.map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</dd></div>)}</dl>}</section>

          <section className="sticker-card overflow-hidden" aria-labelledby="admin-ticket-messages"><div className="border-b border-border px-5 py-4 sm:px-7"><h2 id="admin-ticket-messages" className="text-base font-bold">{t("ticket.conversation")}</h2></div>{detail.messages.length === 0 ? <p className="px-5 py-6 text-sm text-muted-foreground sm:px-7">{t("ticket.noMessages")}</p> : <div className="divide-y divide-border">{detail.messages.map((message) => <article key={message.id} className={`px-5 py-5 sm:px-7 ${message.visibility === "internal" ? "bg-accent-2/5" : ""}`}><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span>{valueOrFallback(message.authorName, message.authorEmail)}</span><span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">{message.visibility === "internal" ? t("admin.detail.internalNote") : t("admin.detail.publicReply")}</span></div><time className="text-xs text-muted-foreground" dateTime={message.createdAt.toISOString()}>{formatDate(message.createdAt, locale)}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{message.body}</p></article>)}</div>}</section>

          <section className="sticker-card p-5 sm:p-7" aria-labelledby="admin-ticket-history"><h2 id="admin-ticket-history" className="text-sm font-bold">{t("admin.detail.history")}</h2>{detail.events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("admin.detail.noHistory")}</p> : <ol className="mt-4 space-y-3">{detail.events.map((event) => <li key={event.id} className="border-l-2 border-border pl-3"><p className="text-xs font-bold">{event.eventType}</p><p className="mt-1 text-xs text-muted-foreground">{valueOrFallback(event.actorName, event.actorEmail)} · {formatDate(event.createdAt, locale)}</p></li>)}</ol>}</section>
        </div>

        <aside className="space-y-5">
          <section className="sticker-card p-5" aria-labelledby="admin-ticket-context"><h2 id="admin-ticket-context" className="text-sm font-bold">{t("admin.detail.title")}</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.requester")}</dt><dd className="mt-0.5 font-bold">{valueOrFallback(detail.ticket.requesterName, detail.ticket.requesterEmail)}</dd><dd className="text-xs text-muted-foreground">{detail.ticket.requesterEmail}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.account")}</dt><dd className="mt-0.5 font-bold">{valueOrFallback(detail.ticket.accountName, detail.ticket.accountEmail)}</dd><dd className="text-xs text-muted-foreground">{detail.ticket.accountEmail}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.screen")}</dt><dd className="mt-0.5 break-words">{context.pageLabel || context.pathname}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.browser")}</dt><dd className="mt-0.5">{context.browser}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.os")}</dt><dd className="mt-0.5">{context.os}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.viewport")}</dt><dd className="mt-0.5">{context.viewport ? `${context.viewport.width} × ${context.viewport.height}` : t("admin.detail.notAvailable")}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.deployment")}</dt><dd className="mt-0.5">{context.deploymentVersion || t("admin.detail.notAvailable")}</dd></div><div><dt className="text-xs font-bold text-muted-foreground">{t("admin.detail.updated")}</dt><dd className="mt-0.5">{formatDate(detail.ticket.lastActivityAt, locale)}</dd></div></dl></section>

          <section className="sticker-card p-5" aria-labelledby="admin-ticket-capture"><h2 id="admin-ticket-capture" className="text-sm font-bold">{t("ticket.attachment")}</h2>{signedAttachments.filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment)).length === 0 ? <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><Paperclip className="size-4" /> {t("admin.detail.noCapture")}</p> : <div className="mt-3 space-y-3">{signedAttachments.filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment)).map((attachment) => <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border px-3 text-sm font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent-2"><span className="flex items-center gap-2"><Paperclip className="size-4" /> {t("admin.detail.capture")}</span><ExternalLink className="size-4" /></a>)}</div>}</section>

          <SupportAdminControls ticketId={detail.ticket.id} status={detail.ticket.status} priority={detail.ticket.priority} assignedStaffId={detail.ticket.assignedStaffId} staff={staff} duplicateOfTicketId={detail.ticket.duplicateOfTicketId} notificationStatus={detail.ticket.notificationStatus} />
        </aside>
      </div>
    </div>
  );
}
