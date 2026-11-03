import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { businesses, referralAttributions, referralCodes } from "@/db/schema";

import {
  REFERRAL_COOKIE_NAME,
  referralCodeSchema,
} from "./schema";

// The cookie is only a public referral-code hint. The server resolves it to a
// live row and the unique referredAccountId constraint makes attribution
// first-touch and race-safe.
export async function captureReferralAttribution(referredAccountId: string): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const rawCode = cookieStore.get(REFERRAL_COOKIE_NAME)?.value;
    const parsedCode = referralCodeSchema.safeParse(rawCode);
    if (!parsedCode.success) return false;

    const [code] = await db
      .select({ id: referralCodes.id, accountId: referralCodes.accountId, ownerUserId: businesses.ownerUserId })
      .from(referralCodes)
      .innerJoin(businesses, eq(businesses.id, referralCodes.accountId))
      .where(and(eq(referralCodes.code, parsedCode.data), eq(referralCodes.isActive, true)))
      .limit(1);

    if (!code || code.accountId === referredAccountId) return false;
    const [referred] = await db.select({ ownerUserId: businesses.ownerUserId }).from(businesses)
      .where(eq(businesses.id, referredAccountId)).limit(1);
    if (!referred || referred.ownerUserId === code.ownerUserId) return false;

    const [attribution] = await db
      .insert(referralAttributions)
      .values({
        referralCodeId: code.id,
        referrerAccountId: code.accountId,
        referredAccountId,
      })
      .onConflictDoNothing({ target: referralAttributions.referredAccountId })
      .returning({ id: referralAttributions.id });

    return Boolean(attribution);
  } catch {
    // Referral attribution must never prevent a legitimate authentication
    // flow from completing. The billing webhook is the authoritative point
    // where a commission can be created later.
    return false;
  }
}
