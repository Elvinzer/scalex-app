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
import { EMPTY_BUSINESS_PROFILE, type BusinessAcquisition, type BusinessSection } from "@/lib/business/types";
import { normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

export async function saveBusinessSection(
  section: BusinessSection,
  data: unknown,
  funnelSource: "settings" | "onboarding" = "settings"
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "business");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const previousProfile = section === "acquisition" ? await getBusinessProfile(accountId) : null;

  const parsed = businessProfileSectionSchemas[section].safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Section invalide" };
  }
  const acquisitionCatalog = section === "acquisition" ? await getAcquisitionFunnelCatalog() : null;

  const persistedData = section === "acquisition" && parsed.data && typeof parsed.data === "object"
    ? (() => {
        const acquisitionData = parsed.data as BusinessAcquisition;
        const normalized = normalizeAcquisitionSelection(acquisitionData, acquisitionCatalog ?? undefined);
        const persistedAcquisitionData = {
          ...acquisitionData,
          funnels: normalized.funnels,
          primaryFunnel: normalized.primaryFunnel,
        };
        delete persistedAcquisitionData.funnelSelectionInferred;
        return persistedAcquisitionData;
      })()
    : parsed.data;

  await db
    .insert(businessProfile)
    .values({ userId: accountId, ...EMPTY_BUSINESS_PROFILE, [section]: persistedData })
    .onConflictDoUpdate({
      target: businessProfile.userId,
      set: { [section]: persistedData, updatedAt: new Date() },
    });

  if (section === "acquisition" && previousProfile) {
    const nextAcquisition = persistedData as typeof previousProfile.acquisition;
    const from = normalizeAcquisitionSelection(previousProfile.acquisition, acquisitionCatalog ?? undefined);
    const to = normalizeAcquisitionSelection(nextAcquisition, acquisitionCatalog ?? undefined);
    const changed = from.primaryFunnel !== to.primaryFunnel || from.funnels.length !== to.funnels.length || from.funnels.some((key, index) => key !== to.funnels[index]);
    if (changed) {
      after(() => track("acquisition_funnel_changed", userId, { from: from.funnels, to: to.funnels, primary: to.primaryFunnel }));
      after(() => track("acquisition_funnel_selected", userId, { funnels: to.funnels, primary: to.primaryFunnel, from: funnelSource }));
    }
  }

  // Keeps the PostHog person's niche/mrr_current in sync with reality
  // instead of a stale one-time snapshot at login — see lib/analytics.ts.
  if (section === "identity") {
    const identity = parsed.data as { niche: string; mrrCurrent: number | null };
    await identifyUser(userId, { niche: identity.niche, mrr_current: identity.mrrCurrent });
  }

  // business_profile_completed fires exactly once, the first time global
  // completion crosses 80% — guarded by users.businessProfileCompletedAt so
  // re-saving an already-complete profile never re-fires it.
  const [userRow] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  if (userRow && !userRow.businessProfileCompletedAt) {
    const fullProfile = await getBusinessProfile(accountId);
    const { percent } = computeGlobalCompletion(fullProfile);
    if (percent >= 80) {
      await db.update(users).set({ businessProfileCompletedAt: new Date() }).where(eq(users.id, accountId));
      after(() => track("business_profile_completed", userId));
    }
  }

  revalidatePath("/business");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/datas");
  revalidateBusinessData();
  return { error: null };
}
