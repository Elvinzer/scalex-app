import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { businessProfile } from "@/db/schema";

import { EMPTY_BUSINESS_PROFILE, type BusinessProfileData } from "./types";

// No row is created at signup — this returns an all-blank default when none
// exists yet, so every page can treat "no profile" and "empty profile" the
// same way. The first successful section save creates the row.
//
// cache()-wrapped: this is read independently by app/(app)/layout.tsx and by
// nearly every page (Dashboard, Diagnostic, Overview, Copilote, Ads, the 7
// lever pages...) on every navigation — same accountId, same row, deduped
// per request like getAccountContext. Server Actions that save a section
// are separate invocations (their own request), so they always see fresh
// data on the next render; this never masks a write within the same request.
export const getBusinessProfile = cache(async (userId: string): Promise<BusinessProfileData> => {
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
});
