import type { Metadata } from "next";
import { Filter, KanbanSquare, List, Search } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { SupportPriorityBadge, SupportStatusBadge } from "@/components/support/status-badge";
import { Button } from "@/components/ui/button";
import { getSupportCounters, getSupportQueue } from "@/lib/support/queries";
import { SUPPORT_TICKET_PRIORITIES, SUPPORT_TICKET_STATUSES, SUPPORT_TICKET_TYPES, type SupportQueueFilters } from "@/lib/support/types";
import { supportQueueFiltersSchema } from "@/lib/support/validation";
import { requireStaffPermission } from "@/lib/staff/permissions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: `${t("admin.navTitle")} | Minaly`, robots: { index: false, follow: false, nocache: true } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function filtersFromSearchParams(searchParams: Record<string, string | string[] | undefined>): SupportQueueFilters {
  const parsed = supportQueueFiltersSchema.safeParse({
    search: one(searchParams.search),
    status: one(searchParams.status),
    type: one(searchParams.type),
    priority: one(searchParams.priority),
    assigned: one(searchParams.assigned),
    view: one(searchParams.view) ?? "table",
  });
  return parsed.success ? parsed.data : { view: "table" };
}

function hrefFor(filters: SupportQueueFilters, view: "table" | "kanban"): string {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.assigned) params.set("assigned", filters.assigned);
  params.set("view", view);
  return `/admin/support?${params.toString()}`;
}

function formatDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}

function displayName(name: string | null, email: string): string {
  return name?.trim() || email;
}

export default async function AdminSupportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaffPermission();
  const t = await getTranslations("support");
  const locale = await getLocale();
  const filters = filtersFromSearchParams(await searchParams);
  const [tickets, counters] = await Promise.all([getSupportQueue(filters), getSupportCounters()]);
  const priorityCount = counters.priority.high + counters.priority.blocking;
  const recentCount = counters.status.new + counters.status.triage + counters.status.in_progress + counters.status.waiting_on_user;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent-text uppercase">{t("admin.navTitle")}</p>
          <h1 className="mt-2 text-[clamp(1.7rem,4vw,2.35rem)] leading-[1.08] font-bold tracking-[-0.03em]">{t("admin.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("admin.description")}</p>
        </div>
        <p className="max-w-xs text-right text-xs leading-5 text-muted-foreground">{t("admin.permission")}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t("admin.title")}>
        {[
          ["new", counters.status.new],
          ["triage", counters.status.triage],
          ["waiting", counters.status.waiting_on_user],
          ["priority", priorityCount],
          ["recent", recentCount],
        ].map(([key, value]) => (
          <div key={key} className="sticker-card p-4"><p className="text-xs font-bold text-muted-foreground">{t(`admin.counters.${key}`)}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>
        ))}
      </section>

      <section className="sticker-card p-4 sm:p-5">
        <form method="get" className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(120px,0.7fr))_auto]">
          <label className="relative block lg:col-span-1">
            <span className="sr-only">{t("admin.filters.search")}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input name="search" defaultValue={filters.search ?? ""} placeholder={t("admin.filters.search")} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12" />
          </label>
          <label><span className="sr-only">{t("admin.filters.status")}</span><select name="status" defaultValue={filters.status ?? ""} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"><option value="">{t("admin.filters.status")}: {t("admin.filters.all")}</option>{SUPPORT_TICKET_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}</select></label>
          <label><span className="sr-only">{t("admin.filters.type")}</span><select name="type" defaultValue={filters.type ?? ""} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"><option value="">{t("admin.filters.type")}: {t("admin.filters.all")}</option>{SUPPORT_TICKET_TYPES.map((type) => <option key={type} value={type}>{t(`form.type.${type}`)}</option>)}</select></label>
          <label><span className="sr-only">{t("admin.filters.priority")}</span><select name="priority" defaultValue={filters.priority ?? ""} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"><option value="">{t("admin.filters.priority")}: {t("admin.filters.all")}</option>{SUPPORT_TICKET_PRIORITIES.map((priority) => <option key={priority} value={priority}>{t(`priority.${priority}`)}</option>)}</select></label>
          <label><span className="sr-only">{t("admin.filters.assignee")}</span><select name="assigned" defaultValue={filters.assigned ?? ""} className="min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-semibold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"><option value="">{t("admin.filters.assignee")}: {t("admin.filters.all")}</option><option value="unassigned">{t("admin.filters.unassigned")}</option><option value="assigned">{t("admin.filters.assigned")}</option></select></label>
          <input type="hidden" name="view" value={filters.view ?? "table"} />
          <Button type="submit" variant="outline" className="min-h-11"><Filter className="size-4" /> {t("admin.filters.apply")}</Button>
        </form>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex gap-2" role="group" aria-label={t("admin.views.table")}>
            <Button asChild variant={filters.view === "kanban" ? "outline" : "default"} className="min-h-11"><Link href={hrefFor(filters, "table")}><List className="size-4" /> {t("admin.views.table")}</Link></Button>
            <Button asChild variant={filters.view === "kanban" ? "default" : "outline"} className="min-h-11"><Link href={hrefFor(filters, "kanban")}><KanbanSquare className="size-4" /> {t("admin.views.kanban")}</Link></Button>
          </div>
          <Link href="/admin/support" className="min-h-11 inline-flex items-center rounded-[var(--radius-control)] px-3 text-sm font-bold text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent-2">{t("admin.filters.reset")}</Link>
        </div>
      </section>

      {filters.view === "kanban" ? (
        <Kanban tickets={tickets} locale={locale} t={t} />
      ) : (
        <TicketTable tickets={tickets} locale={locale} t={t} />
      )}
      <p className="sr-only" aria-live="polite">{t("admin.ticketCount", { count: tickets.length })}</p>
    </div>
  );
}

function TicketTable({ tickets, locale, t }: { tickets: Awaited<ReturnType<typeof getSupportQueue>>; locale: string; t: SupportTranslator }) {
  if (tickets.length === 0) return <EmptyState t={t} />;
  return (
    <section className="sticker-card overflow-hidden p-0" aria-label={t("admin.title")}>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead><tr className="border-b border-border text-xs font-bold text-muted-foreground"><th className="px-4 py-3">{t("admin.table.reference")}</th><th className="px-4 py-3">{t("admin.table.type")}</th><th className="px-4 py-3">{t("admin.table.title")}</th><th className="px-4 py-3">{t("admin.table.account")}</th><th className="px-4 py-3">{t("admin.table.requester")}</th><th className="px-4 py-3">{t("admin.table.priority")}</th><th className="px-4 py-3">{t("admin.table.status")}</th><th className="px-4 py-3">{t("admin.table.assignee")}</th><th className="px-4 py-3">{t("admin.table.activity")}</th></tr></thead>
          <tbody>{tickets.map((ticket) => <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-muted/50"><td className="px-4 py-3 font-bold"><Link href={`/admin/support/${ticket.id}`} className="focus-visible:outline-2 focus-visible:outline-accent-2">{ticket.reference}</Link></td><td className="px-4 py-3 text-muted-foreground">{t(`form.type.${ticket.type}`)}</td><td className="max-w-[230px] truncate px-4 py-3 font-bold">{ticket.title}</td><td className="px-4 py-3">{displayName(ticket.accountName, ticket.accountEmail)}</td><td className="px-4 py-3">{displayName(ticket.requesterName, ticket.requesterEmail)}</td><td className="px-4 py-3"><SupportPriorityBadge priority={ticket.priority} /></td><td className="px-4 py-3"><SupportStatusBadge status={ticket.status} /></td><td className="px-4 py-3 text-muted-foreground">{ticket.assignedStaffEmail ?? t("admin.detail.none")}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">{formatDate(ticket.lastActivityAt, locale)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">{tickets.map((ticket) => <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="block p-4 focus-visible:outline-2 focus-visible:outline-accent-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-bold text-muted-foreground">{ticket.reference} · {t(`form.type.${ticket.type}`)}</p><p className="mt-1 font-bold">{ticket.title}</p></div><SupportPriorityBadge priority={ticket.priority} /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><SupportStatusBadge status={ticket.status} /><span className="text-xs text-muted-foreground">{formatDate(ticket.lastActivityAt, locale)}</span></div></Link>)}</div>
    </section>
  );
}

function Kanban({ tickets, locale, t }: { tickets: Awaited<ReturnType<typeof getSupportQueue>>; locale: string; t: SupportTranslator }) {
  const columns = ["new", "triage", "in_progress", "waiting_on_user", "resolved"] as const;
  return (
    <section className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5" aria-label={t("admin.views.kanban")}>
      {columns.map((status) => {
        const items = tickets.filter((ticket) => ticket.status === status);
        return <div key={status} className="min-w-[240px] rounded-[var(--radius-card)] border border-border bg-surface-sunken p-3"><div className="flex items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase">{t(`status.${status}`)}</h2><span className="text-xs font-bold text-muted-foreground">{items.length}</span></div><div className="mt-3 flex flex-col gap-2">{items.map((ticket) => <Link key={ticket.id} href={`/admin/support/${ticket.id}`} className="rounded-[var(--radius-control)] border border-border bg-card p-3 shadow-sm hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-accent-2"><div className="flex items-start justify-between gap-2"><span className="text-xs font-bold text-muted-foreground">{ticket.reference}</span><SupportPriorityBadge priority={ticket.priority} /></div><p className="mt-2 text-sm font-bold">{ticket.title}</p><p className="mt-2 truncate text-xs text-muted-foreground">{displayName(ticket.requesterName, ticket.requesterEmail)}</p><p className="mt-2 text-[11px] text-muted-foreground">{formatDate(ticket.lastActivityAt, locale)}</p></Link>)}</div></div>;
      })}
    </section>
  );
}

function EmptyState({ t }: { t: SupportTranslator }) {
  return <section className="sticker-card p-10 text-center"><h2 className="text-lg font-bold">{t("admin.empty.title")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("admin.empty.description")}</p></section>;
}

type SupportTranslator = Awaited<ReturnType<typeof getTranslations>>;
