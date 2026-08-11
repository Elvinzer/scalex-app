import type { AcquisitionFunnelCatalogEntry, AcquisitionFunnelKey, AcquisitionFunnelSelection } from "./types";

/**
 * Public slugs are intentionally separate from the database keys.  The key
 * is the stable analytics/data contract; the slug is the human route users
 * see and can bookmark.
 */
export const ACQUISITION_FUNNEL_ROUTES: Readonly<Record<AcquisitionFunnelKey, string>> = {
  lead_magnet: "lead-magnet",
  vsl: "vsl",
  quiz: "quiz",
  appel_direct: "rdv",
  setting_dm: "setting",
  webinaire: "webinaire",
  challenge: "challenge",
  newsletter: "newsletter",
  vente_directe: "page-de-vente",
  communaute: "communaute",
};

const FUNNEL_KEY_BY_SLUG = new Map(
  Object.entries(ACQUISITION_FUNNEL_ROUTES).map(([key, slug]) => [slug, key as AcquisitionFunnelKey])
);

export function acquisitionFunnelHref(key: AcquisitionFunnelKey): string {
  return `/acquisition/${ACQUISITION_FUNNEL_ROUTES[key]}`;
}

export function acquisitionFunnelKeyFromSlug(slug: string): AcquisitionFunnelKey | null {
  return FUNNEL_KEY_BY_SLUG.get(slug) ?? null;
}

export function orderedActiveFunnelKeys(selection: AcquisitionFunnelSelection): AcquisitionFunnelKey[] {
  return [selection.primaryFunnel, ...selection.funnels.filter((key) => key !== selection.primaryFunnel)];
}

export function activeFunnelRoutes(
  selection: AcquisitionFunnelSelection,
  catalog: AcquisitionFunnelCatalogEntry[]
): Array<{ key: AcquisitionFunnelKey; href: string; label: string; primary: boolean }> {
  const labels = new Map(catalog.map((entry) => [entry.funnelKey, entry.label]));
  return orderedActiveFunnelKeys(selection)
    .filter((key) => labels.has(key))
    .map((key) => ({
      key,
      href: acquisitionFunnelHref(key),
      label: labels.get(key) ?? key,
      primary: key === selection.primaryFunnel,
    }));
}
