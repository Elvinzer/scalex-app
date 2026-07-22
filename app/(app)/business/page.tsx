import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

import { BusinessPageClient } from "./business-page-client";

export default async function BusinessPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "business");
  // getAccountContext is memoized per request (already resolved by the guard
  // above), so this is free — used only to gate the owner-only Équipe card.
  const context = await getAccountContext(userId);
  const isOwner = context?.isOwner ?? false;
  const profile = await getBusinessProfile(accountId);

  return <BusinessPageClient initialProfile={profile} isOwner={isOwner} />;
}
