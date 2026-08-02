import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";

// "Pour toi précisément" — a deterministic template filled with the user's
// OWN real fields (niche, main offer) plus the already-computed impact
// explanation, never invented copy. Same "reliability over cleverness"
// precedent as lib/diagnostic/lever-advice.ts's advice templates: one
// generic sentence shape reused for every lever, not 20 hand-authored
// variants, degrading cleanly when a field isn't filled in yet.
export function buildPersonalizedBlurb(businessProfile: BusinessProfileData, impactExplanation: string): string {
  const niche = businessProfile.identity.niche.trim();
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);

  const nichePart = niche ? `Pour ${niche}` : "Pour ton business";
  const offerPart =
    mainOffer?.name && mainOffer.price !== null ? `, avec ton offre "${mainOffer.name}" à ${formatEur(mainOffer.price)}` : "";

  return `${nichePart}${offerPart} : ${impactExplanation}`;
}
