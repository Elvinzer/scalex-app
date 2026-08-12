import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { businessProfile } from "@/db/schema";

import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
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

  const acquisition = row.acquisition;
  const [catalog, blockCatalog] = await Promise.all([
    getAcquisitionFunnelCatalog(),
    getFunnelBlockCatalog(),
  ]);
  const selection = normalizeAcquisitionSelection(acquisition, catalog);
  const blockSelection = normalizeFunnelBlockSelection(acquisition, blockCatalog);
  const hasExplicitSelection = Object.prototype.hasOwnProperty.call(acquisition, "funnels") && Object.prototype.hasOwnProperty.call(acquisition, "primaryFunnel");
  const defaultConfigurations = EMPTY_BUSINESS_PROFILE.acquisition.configurations;
  const storedConfigurations = acquisition.configurations ?? {};

  return {
    identity: row.identity,
    acquisition: {
      ...acquisition,
      funnels: selection.funnels,
      primaryFunnel: selection.primaryFunnel,
      blocks: blockSelection.blocks,
      sources: blockSelection.sources,
      configurations: {
        quiz: { ...defaultConfigurations.quiz, ...storedConfigurations.quiz },
        appel_direct: { ...defaultConfigurations.appel_direct, ...storedConfigurations.appel_direct },
        webinaire: { ...defaultConfigurations.webinaire, ...storedConfigurations.webinaire },
        challenge: { ...defaultConfigurations.challenge, ...storedConfigurations.challenge },
        newsletter: { ...defaultConfigurations.newsletter, ...storedConfigurations.newsletter },
        vente_directe: { ...defaultConfigurations.vente_directe, ...storedConfigurations.vente_directe },
        communaute: { ...defaultConfigurations.communaute, ...storedConfigurations.communaute },
      },
      blockConfigurations: acquisition.blockConfigurations ?? {},
      funnelSelectionInferred: !hasExplicitSelection,
      blockSelectionInferred: acquisition.blockSelectionInferred ?? blockSelection.inferred,
    },
    sales: row.sales,
    delivery: row.delivery,
  };
});
