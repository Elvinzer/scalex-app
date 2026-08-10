import { ArrowUpRight, CalendarClock, CalendarX2, PhoneCall, UserRound } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { CallContactActions } from "@/components/call-contact-actions";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { getRevenueActions } from "@/lib/dashboard/revenue-action-queries";
import type { RevenueAction, RevenueActionAccess, RevenueActionSource } from "@/lib/dashboard/revenue-actions";

import { PostponeActionButton } from "./postpone-action-button";

const ICONS: Record<RevenueActionSource, typeof UserRound> = {
  lead_reminder: UserRound,
  call_decision: PhoneCall,
  lead_no_show: CalendarX2,
  native_booking_lead: CalendarClock,
};
const MAX_VISIBLE_ACTIONS = 5;

function RevenueActionIcon({ action }: { action: RevenueAction }) {
  const Icon = ICONS[action.source];
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
      <Icon className="size-4" />
    </span>
  );
}

function SecondaryAction({ action }: { action: RevenueAction }) {
  return (
    <li className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 transition-colors hover:bg-muted">
      <Link
        href={action.href}
        prefetch={true}
        className="group flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
      >
        <RevenueActionIcon action={action} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{action.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{action.reason}</span>
        </span>
        <span className="max-w-32 shrink-0 text-right text-xs font-bold text-muted-foreground">{action.urgencyLabel}</span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </Link>
      <CallContactActions phone={action.phone} name={action.title} compact className="shrink-0" />
    </li>
  );
}

function RevenueActionCenterContent({ actions }: { actions: RevenueAction[] }) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const tSources = useTranslations("common.sources");
  if (actions.length === 0) return null;

  const [primary, ...secondary] = actions;
  const visibleSecondary = secondary.slice(0, MAX_VISIBLE_ACTIONS - 1);
  const hiddenSecondary = secondary.slice(MAX_VISIBLE_ACTIONS - 1);

  return (
    <section className="sticker-card animate-rise p-4 sm:p-5" aria-labelledby="revenue-actions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-actions-title" className="text-base font-bold">
            {t("actionsTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("actionsHelp")}</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
          {actions.length} {actions.length > 1 ? t("actions") : t("action")}
        </span>
      </div>

      <article className="mt-4 flex min-w-0 flex-col rounded-[var(--radius-card)] border-2 border-accent-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold tracking-wide text-accent-text uppercase">{t("priority", { number: 1 })}</p>
            <p className="mt-2 text-xs font-bold text-muted-foreground">{t("lever")} · {primary.reason}</p>
            <h3 className="mt-2 text-lg font-bold">{primary.title}</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("primaryReason", { reason: primary.reason })}</p>
            <CallContactActions phone={primary.phone} name={primary.title} compact className="mt-3" />
          </div>
          <RevenueActionIcon action={primary} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-y border-border py-3 sm:grid-cols-4">
          <div><p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("value")}</p><p className="mt-1 text-sm font-bold">{primary.valueEur === null ? "—" : formatEur(primary.valueEur, locale)}</p></div>
          <div><p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("age")}</p><p className="mt-1 text-sm font-bold">{primary.urgencyLabel}</p></div>
          <div><p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("effort")}</p><p className="mt-1 text-sm font-bold">{t("low")}</p></div>
          <div><p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">{t("sourceLabel")}</p><p className="mt-1 text-sm font-bold">{primary.source === "lead_reminder" ? tSources("pipeline") : primary.source === "call_decision" ? tSources("iclosed") : primary.source === "lead_no_show" ? tSources("calendly") : tSources("manual")}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href={primary.href} prefetch={true}>{t("open")} {primary.destinationLabel} <ArrowUpRight className="size-4" aria-hidden="true" /></Link>
          </Button>
          <Button asChild size="sm" variant="accent2"><Link href="/copilote" prefetch={true}>{t("askFalco")}</Link></Button>
          <PostponeActionButton />
        </div>
      </article>

      {visibleSecondary.length > 0 && (
        <ul className="mt-3 grid gap-3 md:grid-cols-2" aria-label={t("secondaryActions")}>
          {visibleSecondary.map((action) => <SecondaryAction key={action.id} action={action} />)}
        </ul>
      )}
      {hiddenSecondary.length > 0 && (
        <details className="mt-2 rounded-[var(--radius-control)] border border-border">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
            {t("otherActions", { count: hiddenSecondary.length })}
            <span aria-hidden="true">＋</span>
          </summary>
          <ul className="flex flex-col gap-2 border-t border-border p-2" aria-label={t("otherActionsLabel")}>
            {hiddenSecondary.map((action) => <SecondaryAction key={action.id} action={action} />)}
          </ul>
        </details>
      )}
    </section>
  );
}

export function RevenueActionCenterSkeleton() {
  const t = useTranslations("dashboard");
  return (
    <div className="sticker-card p-4" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <span className="h-4 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <span className="h-6 w-12 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mt-4 h-24 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" />
      <span className="sr-only">{t("loadingActions")}</span>
    </div>
  );
}

export async function RevenueActionCenter({
  accountId,
  permissions,
}: {
  accountId: string;
  permissions: RevenueActionAccess;
}) {
  const t = await getTranslations("dashboard");
  try {
    const actions = await getRevenueActions({ accountId, permissions });
    return <RevenueActionCenterContent actions={actions} />;
  } catch {
    // Keep a transient query failure from making the rest of the Dashboard
    // unavailable, and avoid surfacing database details to the browser.
    console.error("[dashboard] revenue action projection failed");
    return (
      <section className="sticker-card border-state-critical/30 p-4" role="alert" aria-labelledby="revenue-actions-error-title">
        <h2 id="revenue-actions-error-title" className="text-sm font-bold">{t("actionsUnavailable")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("reloadToRetry")}</p>
      </section>
    );
  }
}
