import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  ExternalLink,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import {
  getAdminSubscriptionList,
  getAdminSubscriptionPlans,
  getAdminSubscriptionSummary,
  parseAdminSubscriptionFilters,
  type AdminSubscriptionFilters,
  type AdminSubscriptionListRow,
} from "@/lib/billing/admin-subscriptions";
import {
  formatSubscriptionAmount,
  formatSubscriptionDate,
} from "@/lib/billing/admin-subscription-format";
import { formatUsdCents } from "@/lib/currency";

import { SubscriptionStatusBadge } from "./subscription-status-badge";

export const dynamic = "force-dynamic";

type AdminSubscriptionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = [
  ["all", "Tous les statuts"],
  ["active", "Actif"],
  ["trialing", "Essai en cours"],
  ["past_due", "Paiement en retard"],
  ["unpaid", "Impayé"],
  ["canceled", "Annulé"],
  ["incomplete", "Paiement incomplet"],
  ["incomplete_expired", "Paiement expiré"],
  ["paused", "En pause"],
  ["none", "Sans abonnement"],
] as const;

const cancellationOptions = [
  ["all", "Toutes les annulations"],
  ["scheduled", "Résiliation programmée"],
  ["not_scheduled", "Sans résiliation programmée"],
] as const;

const sortOptions = [
  ["created", "Inscription récente"],
  ["period", "Fin de période"],
  ["email", "Email"],
] as const;

function buildSubscriptionsHref(filters: AdminSubscriptionFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.cancel !== "all") params.set("cancel", filters.cancel);
  if (filters.sort !== "created") params.set("sort", filters.sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/subscriptions?${query}` : "/admin/subscriptions";
}

function AccountIdentity({ row }: { row: AdminSubscriptionListRow }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-bold">{row.displayName || row.email}</p>
      {row.displayName && <p className="truncate text-xs text-muted-foreground">{row.email}</p>}
    </div>
  );
}

function SubscriptionRowDetails({ row }: { row: AdminSubscriptionListRow }) {
  const subscription = row.subscription;
  if (!subscription) {
    return <span className="text-sm text-muted-foreground">Pas d’abonnement</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <SubscriptionStatusBadge status={subscription.status} />
      {subscription.cancelAtPeriodEnd && (
        <span className="text-xs font-bold text-state-caution">
          Se termine le {formatSubscriptionDate(subscription.currentPeriodEnd)}
        </span>
      )}
    </div>
  );
}

function SubscriptionAmount({ row }: { row: AdminSubscriptionListRow }) {
  if (!row.subscription) return <span className="text-muted-foreground">—</span>;
  const amount = formatSubscriptionAmount(row.subscription.priceMonthlyCents);
  return (
    <span className={amount === "À vérifier" ? "font-bold text-state-caution" : "tabular-nums"}>
      {amount}
      {amount !== "À vérifier" && <span className="text-xs text-muted-foreground"> / mois</span>}
    </span>
  );
}

function SubscriptionListItem({ row }: { row: AdminSubscriptionListRow }) {
  return (
    <Link
      href={`/admin/subscriptions/${row.accountId}`}
      className="sticker-card block p-4 transition-transform duration-[var(--motion-fast)] hover:-translate-y-px focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
    >
      <div className="flex items-start justify-between gap-3">
        <AccountIdentity row={row} />
        <ExternalLink className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Statut</p>
          <div className="mt-1"><SubscriptionRowDetails row={row} /></div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Plan / montant</p>
          <p className="mt-1 font-bold">{row.plan?.name ?? (row.subscription ? "Plan introuvable" : "—")}</p>
          <p className="mt-0.5"><SubscriptionAmount row={row} /></p>
        </div>
      </div>
    </Link>
  );
}

export default async function AdminSubscriptionsPage({ searchParams }: AdminSubscriptionsPageProps) {
  await requireAdmin();
  const filters = parseAdminSubscriptionFilters(await searchParams);
  const [list, plans, summary] = await Promise.all([
    getAdminSubscriptionList(filters),
    getAdminSubscriptionPlans(),
    getAdminSubscriptionSummary(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Dashboard fondateurs
          </Link>
          <div className="mt-5 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-2/12 text-accent-2" aria-hidden="true">
              <CreditCard className="size-5" />
            </div>
            <div>
              <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Abonnements clients</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Une vue opérationnelle des comptes clients et de leur projection Stripe. Les membres d’équipe ne sont pas comptés comme des comptes de facturation.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/plans">Gérer les plans</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/referrals">Parrainage</Link>
          </Button>
        </div>
      </header>

      <section aria-label="Indicateurs abonnements" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Actifs / essais</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.activeCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">sur {summary.accountCount} comptes propriétaires</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">À risque de paiement</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.pastDueCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">past_due ou unpaid</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">Sans abonnement</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.noSubscriptionCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">aucune projection locale</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">MRR projeté</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{formatUsdCents(summary.projectedMrrCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.unknownAmountCount > 0 ? `${summary.unknownAmountCount} montant${summary.unknownAmountCount > 1 ? "s" : ""} à vérifier` : "montants Price connus"}
          </p>
        </div>
      </section>

      <section className="sticker-card p-4 sm:p-5" aria-labelledby="subscription-filters-title">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="subscription-filters-title" className="text-sm font-bold">Rechercher et filtrer</h2>
        </div>
        <form
          key={`${filters.q}:${filters.status}:${filters.plan ?? ""}:${filters.cancel}:${filters.sort}`}
          action="/admin/subscriptions"
          method="get"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Compte ou identifiant Stripe</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="email, nom, cus_…"
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Statut</span>
            <select name="status" defaultValue={filters.status} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Plan</span>
            <select name="plan" defaultValue={filters.plan ?? ""} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              <option value="">Tous les plans</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Résiliation</span>
            <select name="cancel" defaultValue={filters.cancel} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {cancellationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Trier par</span>
            <select name="sort" defaultValue={filters.sort} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variant="outline" className="min-h-11 flex-1 lg:flex-none">Appliquer</Button>
            <Button asChild type="button" variant="ghost" className="min-h-11">
              <Link href="/admin/subscriptions">Réinitialiser</Link>
            </Button>
          </div>
        </form>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          <span className="font-bold text-foreground">{list.total}</span> compte{list.total > 1 ? "s" : ""} trouvé{list.total > 1 ? "s" : ""}
          {filters.q && <> pour <span className="font-bold text-foreground">“{filters.q}”</span></>}
        </p>
        <p className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden="true" /> Page {list.page} / {list.totalPages}</p>
      </div>

      {list.rows.length === 0 ? (
        <section className="sticker-card flex flex-col items-center justify-center gap-3 p-10 text-center" aria-live="polite">
          <AlertTriangle className="size-7 text-state-caution" aria-hidden="true" />
          <h2 className="text-lg font-bold">Aucun compte à afficher</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {list.total === 0 ? "Aucun compte propriétaire ne correspond à cette vue pour le moment." : "Les filtres actuels ne renvoient aucun compte sur cette page."}
          </p>
          <Button asChild variant="outline" className="min-h-11"><Link href="/admin/subscriptions">Voir tous les comptes</Link></Button>
        </section>
      ) : (
        <>
          <div className="sticker-card hidden overflow-x-auto p-0 lg:block">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Liste des abonnements clients</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-bold">Compte</th>
                  <th scope="col" className="px-4 py-3 font-bold">Plan</th>
                  <th scope="col" className="px-4 py-3 font-bold">Statut</th>
                  <th scope="col" className="px-4 py-3 font-bold">Montant</th>
                  <th scope="col" className="px-4 py-3 font-bold">Période</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.accountId} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3"><Link href={`/admin/subscriptions/${row.accountId}`} className="block rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12"><AccountIdentity row={row} /></Link></td>
                    <td className="px-4 py-3 font-bold">{row.plan?.name ?? (row.subscription ? "Plan introuvable" : "—")}</td>
                    <td className="px-4 py-3"><SubscriptionRowDetails row={row} /></td>
                    <td className="px-4 py-3"><SubscriptionAmount row={row} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{row.subscription ? formatSubscriptionDate(row.subscription.currentPeriodEnd) : "—"}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/admin/subscriptions/${row.accountId}`} aria-label={`Ouvrir le compte ${row.email}`} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12">Détail <ArrowRight className="size-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {list.rows.map((row) => <SubscriptionListItem key={row.accountId} row={row} />)}
          </div>
        </>
      )}

      {list.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination des abonnements">
          {list.page > 1 ? (
            <Button asChild variant="outline" className="min-h-11"><Link href={buildSubscriptionsHref(filters, list.page - 1)}><ArrowLeft className="size-4" /> Précédent</Link></Button>
          ) : <span />}
          <span className="text-sm text-muted-foreground">Page {list.page} sur {list.totalPages}</span>
          {list.page < list.totalPages ? (
            <Button asChild variant="outline" className="min-h-11"><Link href={buildSubscriptionsHref(filters, list.page + 1)}>Suivant <ArrowRight className="size-4" /></Link></Button>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
