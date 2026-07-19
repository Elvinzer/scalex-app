"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { identifyUser, track } from "@/lib/analytics";
import { db } from "@/db";
import { businessProfile, users } from "@/db/schema";
import { computeGlobalCompletion } from "@/lib/business/completion";
import { getBusinessProfile } from "@/lib/business/queries";
import { businessProfileSectionSchemas } from "@/lib/business/schema";
import { EMPTY_BUSINESS_PROFILE, type BusinessSection } from "@/lib/business/types";
import { createClient } from "@/lib/supabase/server";

export async function saveBusinessSection(
  section: BusinessSection,
  data: unknown
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;

  const parsed = businessProfileSectionSchemas[section].safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Section invalide" };
  }

  await db
    .insert(businessProfile)
    .values({ userId, ...EMPTY_BUSINESS_PROFILE, [section]: parsed.data })
    .onConflictDoUpdate({
      target: businessProfile.userId,
      set: { [section]: parsed.data, updatedAt: new Date() },
    });

  // Keeps the PostHog person's niche/mrr_current in sync with reality
  // instead of a stale one-time snapshot at login — see lib/analytics.ts.
  if (section === "identity") {
    const identity = parsed.data as { niche: string; mrrCurrent: number | null };
    await identifyUser(userId, { niche: identity.niche, mrr_current: identity.mrrCurrent });
  }

  // business_profile_completed fires exactly once, the first time global
  // completion crosses 80% — guarded by users.businessProfileCompletedAt so
  // re-saving an already-complete profile never re-fires it.
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (userRow && !userRow.businessProfileCompletedAt) {
    const fullProfile = await getBusinessProfile(userId);
    const { percent } = computeGlobalCompletion(fullProfile);
    if (percent >= 80) {
      await db.update(users).set({ businessProfileCompletedAt: new Date() }).where(eq(users.id, userId));
      after(() => track("business_profile_completed", userId));
    }
  }

  revalidatePath("/business");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/agent");
  revalidatePath("/delivrabilite/process");
  return { error: null };
}
