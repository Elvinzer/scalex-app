import type { Metadata } from "next";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { SupportOpenButton } from "@/components/support/support-drawer";
import { SupportInboxSeen } from "@/components/support/support-inbox-seen";
import { SupportPriorityBadge, SupportStatusBadge } from "@/components/support/status-badge";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";
import { getUserSupportTickets } from "@/lib/support/queries";
import type { SupportTicketType } from "@/lib/support/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: `${t("page.eyebrow")} | Minaly`, robots: { index: false, follow: false } };
}

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

export default async function SupportPage() {
  const t = await getTranslations("support");
  const locale = await getLocale();
  const { userId, accountId } = await getCurrentUser();
  const context = await getAccountContext(userId);
  const tickets = await getUserSupportTickets({ userId, accountId, isOwner: context?.isOwner ?? true });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-7 pb-10">
      <SupportInboxSeen />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2">
            <ArrowLeft className="size-4" /> {t("page.backToDashboard")}
          </Link>
          <p className="text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("page.eyebrow")}</p>
          <h1 className="mt-2 text-[clamp(1.7rem,4vw,2.35rem)] leading-[1.08] font-bold tracking-[-0.03em]">{t("page.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("page.description")}</p>
        </div>
        <SupportOpenButton className="min-h-11" />
      </header>

      {tickets.length === 0 ? (
        <section className="sticker-card flex flex-col items-center gap-4 p-8 text-center sm:p-12">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-text"><LifeBuoy className="size-6" /></div>
          <div>
            <h2 className="text-lg font-bold">{t("page.emptyTitle")}</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("page.emptyDescription")}</p>
          </div>
          <SupportOpenButton className="min-h-11" />
        </section>
      ) : (
        <section aria-label={t("page.eyebrow")} className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              href={`/support/${ticket.id}`}
              className="sticker-card group flex min-h-28 flex-col gap-4 p-4 transition-transform hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-2 sm:flex-row sm:items-center sm:justify-between sm:p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
                  <span>{ticket.reference}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t(`form.type.${ticket.type as SupportTicketType}`)}</span>
                </div>
                <h2 className="mt-1 truncate text-base font-bold group-hover:text-accent-text">{ticket.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t("page.lastActivity", { time: formatDate(ticket.lastActivityAt, locale) })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SupportPriorityBadge priority={ticket.priority} />
                <SupportStatusBadge status={ticket.status} />
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

