import { acquisitionFunnelKeyFromSlug } from "@/lib/acquisition-funnels/routes";
import type { AcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";

export type BottleneckNavigationSource =
  | "acquisition"
  | "ads"
  | "appointments"
  | "business"
  | "calls"
  | "content"
  | "data"
  | "mail"
  | "pipeline"
  | "salesTracking";

export type BottleneckSourcePage =
  | { kind: "navigation"; key: BottleneckNavigationSource }
  | { kind: "acquisitionPipeline" }
  | { kind: "acquisitionFunnel"; key: AcquisitionFunnelKey }
  | { kind: "funnelBlock"; key: string }
  | { kind: "unknown" };

const FIXED_SOURCE_PAGES: Readonly<Record<string, BottleneckSourcePage>> = {
  "/acquisition": { kind: "navigation", key: "acquisition" },
  "/acquisition/ads": { kind: "navigation", key: "ads" },
  "/acquisition/contenu": { kind: "navigation", key: "content" },
  "/acquisition/mail": { kind: "navigation", key: "mail" },
  "/acquisition/pipeline/funnel": { kind: "acquisitionPipeline" },
  "/business": { kind: "navigation", key: "business" },
  "/crm/appels": { kind: "navigation", key: "calls" },
  "/crm/pipeline": { kind: "navigation", key: "pipeline" },
  "/datas": { kind: "navigation", key: "data" },
  "/ventes/appels": { kind: "navigation", key: "calls" },
  "/ventes/pipeline/funnel": { kind: "navigation", key: "pipeline" },
  "/ventes/rdv": { kind: "navigation", key: "appointments" },
  "/ventes/suivi": { kind: "navigation", key: "salesTracking" },
};

function pathnameOf(href: string): string | null {
  try {
    return new URL(href, "https://minaly.invalid").pathname;
  } catch {
    return null;
  }
}

export function resolveBottleneckSourcePage(href: string, stageId: string): BottleneckSourcePage {
  const pathname = pathnameOf(href);
  if (!pathname) return { kind: "unknown" };

  const fixedPage = FIXED_SOURCE_PAGES[pathname];
  if (fixedPage) return fixedPage;

  const dynamicFunnelPath = /^\/acquisition\/([^/]+)$/u.exec(pathname);
  const slug = dynamicFunnelPath?.[1];
  if (!slug) return { kind: "unknown" };

  const stageKey = stageId.split(":", 1)[0] ?? stageId;
  if (stageKey.replaceAll("_", "-") === slug) {
    return { kind: "funnelBlock", key: stageKey };
  }

  const acquisitionFunnelKey = acquisitionFunnelKeyFromSlug(slug);
  if (acquisitionFunnelKey) return { kind: "acquisitionFunnel", key: acquisitionFunnelKey };

  return { kind: "navigation", key: "acquisition" };
}
