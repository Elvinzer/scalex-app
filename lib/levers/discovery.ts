import { eq } from "drizzle-orm";

import { db } from "@/db";
import { businessLevers } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import type { BusinessProfileData } from "@/lib/business/types";
import { getLeversCatalog, resolveFromBusinessProfile, type LeverCatalogEntry } from "@/lib/levers/catalog";

type BusinessLeverRow = typeof businessLevers.$inferSelect;

// Levers that only make sense for some business shapes — skipped entirely
// (never asked, and excluded from the total) when the profile says they don't
// apply, so we don't ask useless questions. Kept as an explicit predicate
// rather than a DB flag: it's a small, readable business rule, and it stays
// in sync with the profile shape it reads. Returns true = ask it.
function isLeverRelevant(leverKey: string, profile: BusinessProfileData): boolean {
  if (leverKey === "preuve_sociale_page") {
    // Testimonials-on-the-sales-page only matters if the user actually sells
    // via a sales page (some sell purely through closing calls / DMs).
    return profile.sales.offers.some((offer) => offer.saleMode === "page_vente");
  }
  return true;
}

export type DiscoveryState = {
  businessProfile: BusinessProfileData;
  catalog: LeverCatalogEntry[];
  // Only the levers still needing a question, in catalog order — the exact
  // list DiscoveryConversation walks through (and the onboarding step 4 reuse).
  remainingLevers: LeverCatalogEntry[];
  // Always satisfies `remaining + answered === total`, so the progress bar and
  // the "N questions restantes" counter stay consistent everywhere.
  answered: number;
  total: number;
  answeredByKey: Map<string, BusinessLeverRow>;
};

// Single source of truth for "which levers are still unanswered / how far
// through the parcours the user is". Previously duplicated between DiscoveryTab
// and getDiscoveryProgress; now also consumed by the onboarding page.
export async function getDiscoveryState(accountId: string): Promise<DiscoveryState> {
  const [businessProfile, fullCatalog, answeredRows] = await Promise.all([
    getBusinessProfile(accountId),
    getLeversCatalog(),
    db.select().from(businessLevers).where(eq(businessLevers.userId, accountId)),
  ]);

  // Drop levers that don't apply to this business before counting/asking, so
  // both the total and the questionnaire reflect only relevant levers.
  const catalog = fullCatalog.filter((lever) => isLeverRelevant(lever.leverKey, businessProfile));

  const answeredByKey = new Map(answeredRows.map((row) => [row.leverKey, row]));
  const remainingLevers = catalog.filter((lever) => {
    if (lever.readsFromProfile) return resolveFromBusinessProfile(lever.leverKey, businessProfile) === null;
    return !answeredByKey.has(lever.leverKey);
  });

  return {
    businessProfile,
    catalog,
    remainingLevers,
    answered: catalog.length - remainingLevers.length,
    total: catalog.length,
    answeredByKey,
  };
}
