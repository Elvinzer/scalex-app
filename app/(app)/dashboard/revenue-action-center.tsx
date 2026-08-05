import { ArrowUpRight, CalendarClock, CalendarX2, PhoneCall, UserRound } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { getRevenueActions } from "@/lib/dashboard/revenue-action-queries";
import type { RevenueAction, RevenueActionAccess, RevenueActionSource } from "@/lib/dashboard/revenue-actions";

const ICONS: Record<RevenueActionSource, typeof UserRound> = {
  lead_reminder: UserRound,
  call_decision: PhoneCall,
  lead_no_show: CalendarX2,
  native_booking_lead: CalendarClock,
};
const MAX_VISIBLE_ACTIONS = 6;

function RevenueActionIcon({ action }: { action: RevenueAction }) {
  const Icon = ICONS[action.source];
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
      <Icon className="size-4" />
    </span>
  );
}

function ActionDetails({ action }: { action: RevenueAction }) {
  return (
    <>
      <p className="text-xs font-bold tracking-wide text-accent uppercase">{action.urgencyLabel}</p>
      <h3 className="mt-1 truncate text-base font-bold">{action.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{action.reason}</p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted-foreground">
        <span>Destination : {action.destinationLabel}</span>
        {action.valueEur !== null && <span>Valeur potentielle : {formatEur(action.valueEur)}</span>}
      </div>
    </>
  );
}

function SecondaryAction({ action }: { action: RevenueAction }) {
  return (
    <li>
      <Link
        href={action.href}
        className="group flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
      >
        <RevenueActionIcon action={action} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{action.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{action.reason}</span>
        </span>
        <span className="max-w-32 shrink-0 text-right text-xs font-bold text-muted-foreground">{action.urgencyLabel}</span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function RevenueActionCenterContent({ actions }: { actions: RevenueAction[] }) {
  if (actions.length === 0) return null;

  const [primary, ...secondary] = actions;
  const visibleSecondary = secondary.slice(0, MAX_VISIBLE_ACTIONS - 1);
  const hiddenSecondary = secondary.slice(MAX_VISIBLE_ACTIONS - 1);

  return (
    <section className="sticker-card animate-rise p-4 sm:p-5" aria-labelledby="revenue-actions-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="revenue-actions-title" className="text-base font-bold">
            À faire maintenant
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Les actions qui peuvent encore faire avancer ton chiffre.</p>
        </div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">
          {actions.length} {actions.length > 1 ? "actions" : "action"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="flex min-w-0 flex-col justify-between rounded-[var(--radius-card)] border border-accent/30 bg-accent-soft/35 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <RevenueActionIcon action={primary} />
            <div className="min-w-0">
              <ActionDetails action={primary} />
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="mt-4 min-h-11 self-start border-accent text-accent hover:bg-accent-soft">
            <Link href={primary.href}>
              Ouvrir {primary.destinationLabel} <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </article>

        <div className="min-w-0">
          {visibleSecondary.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Actions secondaires">
              {visibleSecondary.map((action) => <SecondaryAction key={action.id} action={action} />)}
            </ul>
          )}
          {hiddenSecondary.length > 0 && (
            <details className="mt-2 rounded-[var(--radius-control)] border border-border">
              <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
                Voir les {hiddenSecondary.length} autres actions
                <span aria-hidden="true">＋</span>
              </summary>
              <ul className="flex flex-col gap-2 border-t border-border p-2" aria-label="Autres actions">
                {hiddenSecondary.map((action) => <SecondaryAction key={action.id} action={action} />)}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

export function RevenueActionCenterSkeleton() {
  return (
    <div className="sticker-card p-4" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center justify-between gap-3">
        <span className="h-4 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <span className="h-6 w-12 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
      </div>
      <div className="mt-4 h-24 animate-pulse rounded-[var(--radius-card)] bg-muted motion-reduce:animate-none" />
      <span className="sr-only">Chargement des actions commerciales…</span>
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
  try {
    const actions = await getRevenueActions({ accountId, permissions });
    return <RevenueActionCenterContent actions={actions} />;
  } catch {
    // Keep a transient query failure from making the rest of the Dashboard
    // unavailable, and avoid surfacing database details to the browser.
    console.error("[dashboard] revenue action projection failed");
    return (
      <section className="sticker-card border-state-critical/30 p-4" role="alert" aria-labelledby="revenue-actions-error-title">
        <h2 id="revenue-actions-error-title" className="text-sm font-bold">Les actions commerciales sont indisponibles</h2>
        <p className="mt-1 text-sm text-muted-foreground">Recharge la page dans un instant pour réessayer.</p>
      </section>
    );
  }
}
