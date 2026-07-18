import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";

import { BusinessPageClient } from "./business-page-client";

export default async function BusinessPage() {
  const { userId } = await getCurrentUser();
  const profile = await getBusinessProfile(userId);

  return <BusinessPageClient initialProfile={profile} />;
}
