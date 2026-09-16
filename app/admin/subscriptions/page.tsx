import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  ExternalLink,
  Search,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

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
  "all", "active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused", "none",
] as const;

const cancellationOptions = [
  "all", "scheduled", "not_scheduled",
] as const;

const sortOptions = [
  "created", "period", "email",
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

function SubscriptionRowDetails({ row, noSubscription, endsOn }: { row: AdminSubscriptionListRow; noSubscription: string; endsOn: string }) {
  const subscription = row.subscription;
  if (!subscription) {
    return <span className="text-sm text-muted-foreground">{noSubscription}</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <SubscriptionStatusBadge status={subscription.status} />
      {subscription.cancelAtPeriodEnd && (
        <span className="text-xs font-bold text-state-caution">
          {endsOn} {formatSubscriptionDate(subscription.currentPeriodEnd)}
        </span>
      )}
    </div>
  );
}

type AdminTranslator = Awaited<ReturnType<typeof getTranslations>>;

function SubscriptionAmount({ row, unavailable, verify, perMonth }: { row: AdminSubscriptionListRow; unavailable: string; verify: string; perMonth: string }) {
  if (!row.subscription) return <span className="text-muted-foreground">{unavailable}</span>;
  const amount = formatSubscriptionAmount(row.subscription.priceMonthlyCents);
  return (
    <span className={amount === "À vérifier" ? "font-bold text-state-caution" : "tabular-nums"}>
      {amount === "À vérifier" ? verify : amount}
      {amount !== "À vérifier" && <span className="text-xs text-muted-foreground"> {perMonth}</span>}
    </span>
  );
}

function SubscriptionListItem({ row, t }: { row: AdminSubscriptionListRow; t: AdminTranslator }) {
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
          <p className="text-xs text-muted-foreground">{t("subscriptions.status")}</p>
          <div className="mt-1"><SubscriptionRowDetails row={row} noSubscription={t("subscriptions.noSubscription")} endsOn={t("subscriptions.endsOn")} /></div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("subscriptions.planAmount")}</p>
          <p className="mt-1 font-bold">{row.plan?.name ?? (row.subscription ? t("subscriptions.planMissing") : t("subscriptions.unavailable"))}</p>
          <p className="mt-0.5"><SubscriptionAmount row={row} unavailable={t("subscriptions.unavailable")} verify={t("subscriptions.verify")} perMonth={t("subscriptions.perMonth")} /></p>
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
  const t = await getTranslations("app.admin");
  type SubscriptionFilterKey = "q" | "status" | "plan" | "cancel" | "sort";
  const activeFilters: Array<{ key: SubscriptionFilterKey; label: string }> = [];
  if (filters.q) activeFilters.push({ key: "q", label: t("subscriptions.searchValue", { value: filters.q }) });
  if (filters.status !== "all") {
    activeFilters.push({
      key: "status",
      label: t("subscriptions.statusValue", { value: t(`subscriptions.statusOptions.${filters.status}`) }),
    });
  }
  if (filters.plan) {
    activeFilters.push({
      key: "plan",
      label: t("subscriptions.planValue", { value: plans.find((plan) => plan.id === filters.plan)?.name ?? t("subscriptions.unavailable") }),
    });
  }
  if (filters.cancel !== "all") {
    activeFilters.push({
      key: "cancel",
      label: t("subscriptions.cancelValue", { value: t(`subscriptions.cancellationOptions.${filters.cancel}`) }),
    });
  }
  if (filters.sort !== "created") {
    activeFilters.push({
      key: "sort",
      label: t("subscriptions.sortValue", { value: t(`subscriptions.sortOptions.${filters.sort}`) }),
    });
  }

  function clearFilterHref(key: SubscriptionFilterKey): string {
    const next = { ...filters, page: 1 };
    if (key === "q") next.q = "";
    if (key === "status") next.status = "all";
    if (key === "plan") next.plan = undefined;
    if (key === "cancel") next.cancel = "all";
    if (key === "sort") next.sort = "created";
    return buildSubscriptionsHref(next, 1);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            {t("subscriptions.backToDashboard")}
          </Link>
          <div className="mt-5 flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-2/12 text-accent-2" aria-hidden="true">
              <CreditCard className="size-5" />
            </div>
            <div>
              <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("subscriptions.title")}</h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("subscriptions.description")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="min-h-11">
            <Link href="/admin/plans">{t("subscriptions.managePlans")}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/admin/referrals">{t("subscriptions.referrals")}</Link>
          </Button>
        </div>
      </header>

      <section aria-label={t("subscriptions.metricsLabel")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("subscriptions.activeTrials")}</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.activeCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("subscriptions.ownerAccounts", { count: summary.accountCount })}</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("subscriptions.paymentRisk")}</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.pastDueCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("subscriptions.paymentRiskHelp")}</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("subscriptions.noSubscription")}</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{summary.noSubscriptionCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("subscriptions.noLocalProjection")}</p>
        </div>
        <div className="sticker-card p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("subscriptions.projectedMrr")}</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums">{formatUsdCents(summary.projectedMrrCents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.unknownAmountCount > 0 ? t("subscriptions.amountsToVerify", { count: summary.unknownAmountCount }) : t("subscriptions.knownPrices")}
          </p>
        </div>
      </section>

      <section className="sticker-card p-4 sm:p-5" aria-labelledby="subscription-filters-title">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 id="subscription-filters-title" className="text-sm font-bold">{t("subscriptions.filterTitle")}</h2>
        </div>
        <form
          key={`${filters.q}:${filters.status}:${filters.plan ?? ""}:${filters.cancel}:${filters.sort}`}
          action="/admin/subscriptions"
          method="get"
          className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("subscriptions.accountOrStripeId")}</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder={t("subscriptions.searchPlaceholder")}
              className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("subscriptions.status")}</span>
            <select name="status" defaultValue={filters.status} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {statusOptions.map((value) => <option key={value} value={value}>{t(`subscriptions.statusOptions.${value}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("subscriptions.plan")}</span>
            <select name="plan" defaultValue={filters.plan ?? ""} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              <option value="">{t("subscriptions.allPlans")}</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("subscriptions.cancellation")}</span>
            <select name="cancel" defaultValue={filters.cancel} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {cancellationOptions.map((value) => <option key={value} value={value}>{t(`subscriptions.cancellationOptions.${value}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("subscriptions.sortBy")}</span>
            <select name="sort" defaultValue={filters.sort} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12">
              {sortOptions.map((value) => <option key={value} value={value}>{t(`subscriptions.sortOptions.${value}`)}</option>)}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button type="submit" variant="outline" className="min-h-11 flex-1 lg:flex-none">{t("subscriptions.apply")}</Button>
            <Button asChild type="button" variant="ghost" className="min-h-11">
              <Link href="/admin/subscriptions">{t("subscriptions.reset")}</Link>
            </Button>
          </div>
        </form>
        <div className="mt-4 rounded-[var(--radius-control)] bg-muted/40 px-3 py-3 text-sm" aria-live="polite">
          <p className="font-bold">{t("subscriptions.activeFilters")}</p>
          {activeFilters.length === 0 ? (
            <p className="mt-1 text-muted-foreground">{t("subscriptions.noActiveFilters")}</p>
          ) : (
            <ul className="mt-2 flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <li key={filter.key}>
                  <Link
                    href={clearFilterHref(filter.key)}
                    aria-label={t("subscriptions.clearFilter", { label: filter.label })}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-bold text-foreground hover:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12"
                  >
                    {filter.label}
                    <X className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 rounded-[var(--radius-control)] border border-border px-3 py-3 text-sm" role="note">
          <p className="font-bold">{t("subscriptions.dataLegendTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("subscriptions.dataLegend")}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          {t("subscriptions.resultCount", { count: list.total })}
          {filters.q && <> {t("subscriptions.forQuery")} <span className="font-bold text-foreground">“{filters.q}”</span></>}
        </p>
        <p className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden="true" /> {t("subscriptions.pageOf", { page: list.page, total: list.totalPages })}</p>
      </div>

      {list.rows.length === 0 ? (
        <section className="sticker-card flex flex-col items-center justify-center gap-3 p-10 text-center" aria-live="polite">
          <AlertTriangle className="size-7 text-state-caution" aria-hidden="true" />
          <h2 className="text-lg font-bold">{t("subscriptions.emptyTitle")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {list.total === 0 ? t("subscriptions.emptyAll") : t("subscriptions.emptyFiltered")}
          </p>
          <Button asChild variant="outline" className="min-h-11"><Link href="/admin/subscriptions">{t("subscriptions.viewAll")}</Link></Button>
        </section>
      ) : (
        <>
          <div className="sticker-card hidden overflow-x-auto p-0 lg:block">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{t("subscriptions.tableCaption")}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-bold">{t("subscriptions.account")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("subscriptions.plan")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("subscriptions.status")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("subscriptions.amount")}</th>
                  <th scope="col" className="px-4 py-3 font-bold">{t("subscriptions.period")}</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">{t("subscriptions.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={row.accountId} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3"><Link href={`/admin/subscriptions/${row.accountId}`} className="block rounded-[var(--radius-control)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12"><AccountIdentity row={row} /></Link></td>
                    <td className="px-4 py-3 font-bold">{row.plan?.name ?? (row.subscription ? t("subscriptions.planMissing") : t("subscriptions.unavailable"))}</td>
                    <td className="px-4 py-3"><SubscriptionRowDetails row={row} noSubscription={t("subscriptions.noSubscription")} endsOn={t("subscriptions.endsOn")} /></td>
                    <td className="px-4 py-3"><SubscriptionAmount row={row} unavailable={t("subscriptions.unavailable")} verify={t("subscriptions.verify")} perMonth={t("subscriptions.perMonth")} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{row.subscription ? formatSubscriptionDate(row.subscription.currentPeriodEnd) : t("subscriptions.unavailable")}</td>
                    <td className="px-4 py-3 text-right"><Link href={`/admin/subscriptions/${row.accountId}`} aria-label={t("subscriptions.openAccount", { email: row.email })} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-2 text-sm font-bold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12">{t("subscriptions.detail")} <ArrowRight className="size-4" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {list.rows.map((row) => <SubscriptionListItem key={row.accountId} row={row} t={t} />)}
          </div>
        </>
      )}

      {list.totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label={t("subscriptions.pagination")}>
          {list.page > 1 ? (
            <Button asChild variant="outline" className="min-h-11"><Link href={buildSubscriptionsHref(filters, list.page - 1)}><ArrowLeft className="size-4" /> {t("subscriptions.previous")}</Link></Button>
          ) : <span />}
          <span className="text-sm text-muted-foreground">{t("subscriptions.pageOf", { page: list.page, total: list.totalPages })}</span>
          {list.page < list.totalPages ? (
            <Button asChild variant="outline" className="min-h-11"><Link href={buildSubscriptionsHref(filters, list.page + 1)}>{t("subscriptions.next")} <ArrowRight className="size-4" /></Link></Button>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
