import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { todayUtc } from "@/lib/date-range";
import { buildOfferPerformance, buildUpsellPerformance } from "@/lib/business/performance";
import { getSalesForMonth } from "@/lib/sales/queries";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";

import { BusinessPageClient } from "./business-page-client";

export default async function BusinessPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "business");
  // getAccountContext is memoized per request (already resolved by the guard
  // above), so this is free — used only to gate the owner-only Équipe card.
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const canViewSalesPerformance =
    context === null || context === undefined
      ? false
      : context.permissions === "all"
        ? true
        : context.permissions.has("ventes:suivi");
  const today = todayUtc();
  const [profile, monthSales, funnelBlocks] = await Promise.all([
    getBusinessProfile(accountId),
    canViewSalesPerformance
      ? getSalesForMonth(accountId, today.getUTCFullYear(), today.getUTCMonth() + 1)
    : Promise.resolve([]),
    getFunnelBlockCatalog(),
  ]);

  return (
    <BusinessPageClient
      initialProfile={profile}
      funnelBlocks={funnelBlocks}
      isOwner={isOwner}
      canViewSalesPerformance={canViewSalesPerformance}
      offerPerformance={buildOfferPerformance(profile.sales.offers, monthSales)}
      upsellPerformance={buildUpsellPerformance(profile.sales.offers, monthSales)}
    />
  );
}
