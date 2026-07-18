import type { BusinessProfileData } from "./types";

// Cheapest, most meaningful signal that the profile is too thin to be useful
// yet — drives the nudge banners on Dashboard/Diagnostic/Agent (additive
// only, doesn't affect what those pages actually compute in Phase 1).
export function isBusinessProfileThin(profile: BusinessProfileData): boolean {
  return !profile.sales.offers.some(
    (offer) => offer.name.trim().length > 0 && (offer.price ?? 0) > 0
  );
}
