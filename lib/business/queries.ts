import { eq } from "drizzle-orm";

import { db } from "@/db";
import { businessProfile } from "@/db/schema";

import { EMPTY_BUSINESS_PROFILE, type BusinessProfileData } from "./types";

// No row is created at signup — this returns an all-blank default when none
// exists yet, so every page can treat "no profile" and "empty profile" the
// same way. The first successful section save creates the row.
export async function getBusinessProfile(userId: string): Promise<BusinessProfileData> {
  const [row] = await db
    .select()
    .from(businessProfile)
    .where(eq(businessProfile.userId, userId))
    .limit(1);

  if (!row) return EMPTY_BUSINESS_PROFILE;

  return {
    identity: row.identity,
    acquisition: row.acquisition,
    sales: row.sales,
    delivery: row.delivery,
  };
}
