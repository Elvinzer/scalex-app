import type { Metadata } from "next";
import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { SupportPriorityBadge, SupportStatusBadge } from "@/components/support/status-badge";
import { SupportReplyForm } from "@/components/support/support-reply-form";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";
import { getUserSupportTicketDetail } from "@/lib/support/queries";
import type { SupportTicketType } from "@/lib/support/types";
import { supportTicketIdSchema } from "@/lib/support/validation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: `${t("ticket.conversation")} | Minaly`, robots: { index: false, follow: false } };
}

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function SupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const t = await getTranslations("support");
  const locale = await getLocale();
  const { userId, accountId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const { ticketId } = await params;
  if (!supportTicketIdSchema.safeParse(ticketId).success) notFound();
  const detail = await getUserSupportTicketDetail({ userId, accountId, isOwner: context?.isOwner ?? true, ticketId });
  if (!detail) notFound();

  const detailValues = [
    [t("ticket.expected"), detail.ticket.details.expectedResult],
    [t("ticket.observed"), detail.ticket.details.observedResult],
    [t("ticket.steps"), detail.ticket.details.reproductionSteps],
    [t("ticket.impact"), detail.ticket.details.impact],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-10">
      <Link href="/support" className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2">
        <ArrowLeft className="size-4" /> {t("ticket.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
            <span>{detail.ticket.reference}</span>
            <span aria-hidden="true">·</span>
            <span>{t(`form.type.${detail.ticket.type as SupportTicketType}`)}</span>
          </div>
          <h1 className="mt-2 text-[clamp(1.5rem,4vw,2.25rem)] leading-[1.1] font-bold tracking-[-0.03em]">{detail.ticket.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("page.createdAt", { time: formatDate(detail.ticket.createdAt, locale) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><SupportPriorityBadge priority={detail.ticket.priority} /><SupportStatusBadge status={detail.ticket.status} /></div>
      </header>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="ticket-description">
        <h2 id="ticket-description" className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("ticket.description")}</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{detail.ticket.description}</p>
        {detailValues.length > 0 && (
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            {detailValues.map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{value}</dd></div>)}
          </dl>
        )}
        {detail.hasAttachment && <p className="mt-5 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Paperclip className="size-4" /> {t("ticket.attachment")}</p>}
      </section>

      <section className="sticker-card overflow-hidden" aria-labelledby="ticket-conversation">
        <div className="border-b border-border px-5 py-4 sm:px-7"><h2 id="ticket-conversation" className="text-base font-bold">{t("ticket.conversation")}</h2></div>
        {detail.messages.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground sm:px-7">{t("ticket.noMessages")}</p>
        ) : (
          <div className="divide-y divide-border">
            {detail.messages.map((message) => (
              <article key={message.id} className="px-5 py-5 sm:px-7">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-muted-foreground"><span>{message.authorName || t("ticket.supportTeam")}</span><time dateTime={message.createdAt.toISOString()}>{formatDate(message.createdAt, locale)}</time></div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{message.body}</p>
              </article>
            ))}
          </div>
        )}
        <SupportReplyForm ticketId={detail.ticket.id} />
      </section>
    </div>
  );
}
