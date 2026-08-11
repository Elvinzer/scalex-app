import { revalidatePath } from "next/cache";

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
  "/acquisition/pipeline",
  "/acquisition/pipeline/funnel",
  "/acquisition/contenu",
  "/acquisition/contenu/youtube",
  "/acquisition/contenu/instagram",
  "/acquisition/mail",
  "/acquisition/ads",
  "/acquisition/setters",
  "/ventes/appels",
  "/ventes/appels/funnel",
  "/ventes/appels/videos",
  "/ventes/rdv",
  "/ventes/suivi",
  "/business",
] as const;

export function revalidateBusinessData(): void {
  for (const path of BUSINESS_DATA_PATHS) revalidatePath(path);
}
