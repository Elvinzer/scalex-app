import { revalidatePath, revalidateTag } from "next/cache";

import { DIAGNOSTIC_DATA_CACHE_TAG } from "@/lib/diagnostic/cache-tags";
import { ACQUISITION_FUNNEL_ROUTES } from "@/lib/acquisition-funnels/routes";

// All pages that consume the shared business funnel. A mutation in one
// module must invalidate every projection of the same event, otherwise a
// user can navigate from a freshly updated page to a stale Diagnostic or
// Roadmap and believe the numbers disagree.
const BUSINESS_DATA_PATHS = [
  "/dashboard",
  "/diagnostic",
  "/datas",
  "/roadmap",
  "/journal",
  "/copilote",
  "/acquisition",
  "/ventes/pipeline",
  "/ventes/pipeline/funnel",
  "/acquisition/contenu",
  "/acquisition/contenu/youtube",
  "/acquisition/contenu/instagram",
  "/acquisition/mail",
  "/acquisition/ads",
  "/ventes/setters",
  "/ventes/appels",
  "/ventes/appels/funnel",
  "/ventes/appels/videos",
  "/ventes/rdv",
  "/ventes/suivi",
  "/business",
  "/integrations",
] as const;

const ACQUISITION_FUNNEL_PATHS = Object.values(ACQUISITION_FUNNEL_ROUTES).map((slug) => `/acquisition/${slug}`);

export function revalidateBusinessData(): void {
  // The tag is invalidated only from real business-data mutations and sync
  // triggers. `max` keeps the last snapshot available while the next one is
  // rebuilt, so the user does not wait on a cold diagnostic query after a
  // navigation.
  revalidateTag(DIAGNOSTIC_DATA_CACHE_TAG, "max");
  for (const path of BUSINESS_DATA_PATHS) revalidatePath(path);
  for (const path of ACQUISITION_FUNNEL_PATHS) revalidatePath(path);
}

// Journal mutations affect the action loop shown on Roadmap and can change
// the improvement context displayed on Dashboard and Diagnostic.
export function revalidateJournalSurfaces(): void {
  for (const path of ["/journal", "/roadmap", "/dashboard", "/diagnostic"] as const) revalidatePath(path);
}
