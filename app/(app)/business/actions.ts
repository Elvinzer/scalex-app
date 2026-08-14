"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { identifyUser, track } from "@/lib/analytics";
import { db } from "@/db";
import { businessProfile, users } from "@/db/schema";
import { computeGlobalCompletion } from "@/lib/business/completion";
import { getBusinessProfile } from "@/lib/business/queries";
import { businessProfileSectionSchemas } from "@/lib/business/schema";
import { EMPTY_BUSINESS_PROFILE, type BusinessAcquisition, type BusinessSection } from "@/lib/business/types";
import { normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { isAcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";
import { legacyFunnelKeysForBlocks, normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

const acquisitionBlocksInputSchema = z.object({
  blocks: z.array(z.object({ blockKey: z.string().min(1).max(100), order: z.number().int().min(1).max(20) })).min(2).max(11),
  sources: z.array(z.enum(["organique", "ads", "newsletter", "bouche_a_oreille", "communaute_externe"])).min(1).max(5),
});

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
  const [acquisitionCatalog, blockCatalog] = section === "acquisition"
    ? await Promise.all([getAcquisitionFunnelCatalog(), getFunnelBlockCatalog()])
    : [null, null];

  const persistedData = section === "acquisition" && parsed.data && typeof parsed.data === "object"
    ? (() => {
        const acquisitionData = parsed.data as BusinessAcquisition;
        const normalized = normalizeAcquisitionSelection(acquisitionData, acquisitionCatalog ?? undefined);
        const blockSelection = normalizeFunnelBlockSelection(acquisitionData, blockCatalog ?? undefined);
        const projectedLegacyFunnels = legacyFunnelKeysForBlocks(blockSelection, blockCatalog ?? []).filter(isAcquisitionFunnelKey);
        const persistedAcquisitionData = {
          ...acquisitionData,
          funnels: projectedLegacyFunnels.length > 0 ? projectedLegacyFunnels : normalized.funnels,
          primaryFunnel: projectedLegacyFunnels.includes(normalized.primaryFunnel) ? normalized.primaryFunnel : projectedLegacyFunnels[0] ?? normalized.primaryFunnel,
          blocks: blockSelection.blocks,
          sources: blockSelection.sources,
        };
        delete persistedAcquisitionData.funnelSelectionInferred;
        delete persistedAcquisitionData.blockSelectionInferred;
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
    const fromBlocks = normalizeFunnelBlockSelection(previousProfile.acquisition, blockCatalog ?? undefined);
    const toBlocks = normalizeFunnelBlockSelection(nextAcquisition, blockCatalog ?? undefined);
    const changed = from.primaryFunnel !== to.primaryFunnel || from.funnels.length !== to.funnels.length || from.funnels.some((key, index) => key !== to.funnels[index]);
    const blocksChanged = JSON.stringify(fromBlocks.blocks) !== JSON.stringify(toBlocks.blocks) || JSON.stringify(fromBlocks.sources) !== JSON.stringify(toBlocks.sources);
    if (changed) {
      after(() => track("acquisition_funnel_changed", userId, { from: from.funnels, to: to.funnels, primary: to.primaryFunnel }));
      after(() => track("acquisition_funnel_selected", userId, { funnels: to.funnels, primary: to.primaryFunnel, from: funnelSource }));
    }
    if (blocksChanged) {
      after(() => track("funnel_blocks_changed", userId, { from: fromBlocks.blocks, to: toBlocks.blocks, from_sources: fromBlocks.sources, to_sources: toBlocks.sources }));
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
  revalidatePath("/diagnostic-app");
  revalidatePath("/datas");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

export async function saveAcquisitionBlocks(
  data: unknown,
  funnelSource: "settings" | "onboarding" = "settings"
): Promise<{ error: string | null }> {
  const parsed = acquisitionBlocksInputSchema.safeParse(data);
  if (!parsed.success) return { error: "Ton parcours d'acquisition est invalide." };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return { error: "Session expirée, reconnecte-toi." };
  const access = await requirePermission(authData.claims.sub as string, "business");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const profile = await getBusinessProfile(access.accountId);
  const result = await saveBusinessSection(
    "acquisition",
    { ...profile.acquisition, blocks: parsed.data.blocks, sources: parsed.data.sources, blockSelectionInferred: false },
    funnelSource
  );
  if (!result.error) {
    after(() => track("funnel_blocks_selected", authData.claims.sub as string, {
      blocks: parsed.data.blocks,
      sources: parsed.data.sources,
      from: funnelSource,
      used_builder: true,
    }));
  }
  return result;
}
