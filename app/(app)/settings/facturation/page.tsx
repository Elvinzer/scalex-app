import { Button } from "@/components/ui/button";
import { getLocale, getTranslations } from "next-intl/server";
import { isAdminEmail } from "@/lib/admin";
import { formatSubscriptionAmount } from "@/lib/billing/admin-subscription-format";
import { parsePlanFeatures } from "@/lib/billing/plan-schema";
import { getAccountSubscription, getActivePlans } from "@/lib/billing/queries";
import { formatUsdCents } from "@/lib/currency";
import { getCurrentUser, requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

export default async function FacturationPage() {
  const t = await getTranslations("settings.billing");
  const locale = await getLocale();
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);
  const { user } = await getCurrentUser();
  const isAdmin = Boolean(user?.email && isAdminEmail(user.email));

  const [subscription, plans] = await Promise.all([
    getAccountSubscription(access.accountId),
    getActivePlans(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {isAdmin && (
        <div className="sticker-card p-8">
          <p className="text-sm font-bold text-muted-foreground">{t("adminAccess")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("adminHelp")}</p>
        </div>
      )}

      {subscription && (
        <div className="sticker-card p-8">
          <p className="text-sm font-bold text-muted-foreground">{t("currentSubscription")}</p>
          <div className="mt-2 flex items-center gap-3">
            <p className="text-lg font-bold">{subscription.plan.name}</p>
            <span className="rounded-full bg-signal/15 px-3 py-1 text-xs font-bold text-signal">
              {t(`status.${subscription.status}`)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {subscription.priceMonthlyCents === null ? t("historicalAmount") : `${formatSubscriptionAmount(subscription.priceMonthlyCents)} ${t("perMonth")}`}
            {subscription.currentPeriodEnd &&
              ` (${subscription.cancelAtPeriodEnd ? t("ends") : t("renews")} ${t("on")} ${new Date(
                subscription.currentPeriodEnd
              ).toLocaleDateString(locale)})`}
          </p>
          <Button asChild variant="outline" className="mt-4">
            <a href="/api/billing/portal">{t("manageSubscription")} →</a>
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const features = parsePlanFeatures(plan.features);
          const isCurrent = subscription?.plan.id === plan.id && subscription.status !== "canceled";
          return (
            <div key={plan.id} className="sticker-card flex flex-col gap-3 p-6">
              <p className="text-sm font-bold text-muted-foreground">{plan.name}</p>
              <p className="font-display text-2xl font-bold">{formatUsdCents(plan.priceMonthlyCents)}<span className="text-sm font-normal text-muted-foreground">/mois</span></p>
              <p className="text-sm text-muted-foreground">
                {features.teamMembersEnabled
                  ? `${t("teamIncluded")}${features.maxTeamMembers ? ` (${t("upToMembers", { count: features.maxTeamMembers })})` : ""}`
                  : t("noTeam")}
              </p>
              <Button asChild disabled={isCurrent} className="mt-2">
                <a href={`/api/billing/checkout?plan=${plan.key}`}>
                  {isCurrent ? t("currentPlan") : subscription ? t("changePlan") : t("subscribe")}
                </a>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
