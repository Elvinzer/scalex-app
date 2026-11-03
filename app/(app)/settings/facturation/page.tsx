import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSubscriptionStatusClassName } from "@/lib/billing/admin-subscription-format";
import { parsePlanFeatures } from "@/lib/billing/plan-schema";
import { getAccountSubscription, getActivePlans } from "@/lib/billing/queries";
import { getBusinessEntitlement } from "@/lib/businesses/entitlements";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwner } from "@/lib/team/context";

export default async function FacturationPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("billing");
  const locale = await getLocale();
  const userId = await requireUserId();
  const access = await requireOwner(userId, { allowSuspended: true });
  if (!access) redirect("/businesses");
  const { user } = await getCurrentUser({ allowSuspended: true });
  const [subscription, plans, entitlement, query] = await Promise.all([
    getAccountSubscription(access.accountId), getActivePlans(), getBusinessEntitlement(access.accountId), searchParams,
  ]);
  const price = (cents: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
  const statusLabels: Record<string, string> = {
    active: t("status.active"), trialing: t("status.trialing"), past_due: t("status.past_due"), unpaid: t("status.unpaid"),
    canceled: t("status.canceled"), incomplete: t("status.incomplete"), incomplete_expired: t("status.incomplete_expired"),
    paused: t("status.paused"),
  };
  const status = subscription?.paymentBlockedAt ? "past_due" : subscription?.status;
  const portalUrl = `/api/billing/portal?business=${access.accountId}`;
  const checkoutMessage = query.checkout === "failed" ? t("checkoutFailed")
    : query.checkout === "cancelled" ? t("checkoutCancelled")
      : (query.checkout === "processing" || query.checkout === "success") && !entitlement.active ? t("checkoutProcessing")
        : query.portal === "failed" ? t("portalFailed") : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { name: user?.name ?? "" })}</p>
      </div>
      {checkoutMessage && <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">{checkoutMessage}</p>}
      {entitlement.isExempt ? (
        <div className="sticker-card p-8">
          <p className="font-bold">{t("adminAccess")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("adminHelp")}</p>
        </div>
      ) : !entitlement.active && (
        <div className="sticker-card border-state-caution/30 p-8">
          <h2 className="text-lg font-bold">{subscription ? t("blockedTitle") : t("pendingTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{subscription ? t("blockedHelp") : t("pendingHelp")}</p>
          {user?.stripeCustomerId && <Button asChild className="mt-4"><a href={portalUrl}>{t("manageSubscription")}</a></Button>}
        </div>
      )}
      {subscription && (
        <div className="sticker-card p-8">
          <p className="text-sm font-bold text-muted-foreground">{t("currentSubscription")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-bold">{subscription.plan.name}</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getSubscriptionStatusClassName(status ?? "unknown")}`}>
              {statusLabels[status ?? "unknown"] ?? t("status.unknown")}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {subscription.priceMonthlyCents === null ? t("historicalAmount") : `${price(subscription.priceMonthlyCents)} ${t("perMonth")}`}
          </p>
          {subscription.currentPeriodEnd && <p className="mt-1 text-sm text-muted-foreground">
            {subscription.cancelAtPeriodEnd ? t("ends") : t("renews")} {t("on")} {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(subscription.currentPeriodEnd)}
          </p>}
          <Button asChild variant="outline" className="mt-4"><a href={portalUrl}>{t("manageSubscription")}</a></Button>
        </div>
      )}
      {!entitlement.isExempt && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const features = parsePlanFeatures(plan.features);
          const isCurrent = subscription?.plan.id === plan.id && entitlement.active;
          const existingSubscription = subscription?.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(subscription.status);
          const href = existingSubscription ? portalUrl : `/api/billing/checkout?business=${access.accountId}&plan=${encodeURIComponent(plan.key)}`;
          return <div key={plan.id} className="sticker-card flex flex-col gap-3 p-6">
            <h2 className="text-sm font-bold">{plan.name}</h2>
            <p className="font-display text-2xl font-bold">{price(plan.priceMonthlyCents)} <span className="text-sm font-normal text-muted-foreground">{t("perMonthShort")}</span></p>
            <p className="text-sm text-muted-foreground">
              {features.teamMembersEnabled ? `${t("teamIncluded")}${features.maxTeamMembers ? ` (${t("upToMembers", { count: features.maxTeamMembers })})` : ""}` : t("noTeam")}
            </p>
            {isCurrent ? <Button variant="outline" disabled className="mt-auto">{t("currentPlan")}</Button>
              : <Button asChild variant="outline" className="mt-auto"><a href={href}>{existingSubscription ? t("changePlan") : t("subscribe")}</a></Button>}
          </div>;
        })}
      </div>}
    </div>
  );
}
