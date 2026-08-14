import { eq } from "drizzle-orm";

import { db } from "@/db";
import { instagramConnections, youtubeConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { mergeConnectedPlatformPrefills, type ConnectedPlatformPrefill } from "@/lib/business/platform-prefill";
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
  const [profile, monthSales, funnelBlocks, [instagramConnection], [youtubeConnection]] = await Promise.all([
    getBusinessProfile(accountId),
    canViewSalesPerformance
      ? getSalesForMonth(accountId, today.getUTCFullYear(), today.getUTCMonth() + 1)
    : Promise.resolve([]),
    getFunnelBlockCatalog(),
    db
      .select({ username: instagramConnections.username })
      .from(instagramConnections)
      .where(eq(instagramConnections.userId, accountId))
      .limit(1),
    db
      .select({ channelId: youtubeConnections.channelId })
      .from(youtubeConnections)
      .where(eq(youtubeConnections.userId, accountId))
      .limit(1),
  ]);

  const connectedPlatformPrefills: ConnectedPlatformPrefill[] = [
    instagramConnection
      ? {
          name: "Instagram",
          url: instagramConnection.username
            ? `https://www.instagram.com/${encodeURIComponent(instagramConnection.username.trim().replace(/^@/, ""))}`
            : "",
        }
      : null,
    youtubeConnection
      ? {
          name: "YouTube",
          url: `https://www.youtube.com/channel/${encodeURIComponent(youtubeConnection.channelId)}`,
        }
      : null,
  ].filter((prefill): prefill is ConnectedPlatformPrefill => prefill !== null);
  const mergedAcquisition = mergeConnectedPlatformPrefills(profile.acquisition.platforms, connectedPlatformPrefills);
  const initialProfile = mergedAcquisition.changed
    ? { ...profile, acquisition: { ...profile.acquisition, platforms: mergedAcquisition.platforms } }
    : profile;

  return (
    <BusinessPageClient
      initialProfile={initialProfile}
      funnelBlocks={funnelBlocks}
      isOwner={isOwner}
      canViewSalesPerformance={canViewSalesPerformance}
      offerPerformance={buildOfferPerformance(profile.sales.offers, monthSales)}
      upsellPerformance={buildUpsellPerformance(profile.sales.offers, monthSales)}
    />
  );
}
