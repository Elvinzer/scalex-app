import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { BusinessPageClient } from "./business-page-client";

export default async function BusinessPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "business");
  const profile = await getBusinessProfile(accountId);

  return <BusinessPageClient initialProfile={profile} />;
}
