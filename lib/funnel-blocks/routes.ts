import type { FunnelBlockCatalogEntry, FunnelBlockSelection } from "./types";

export function funnelBlockSlug(blockKey: string): string {
  return blockKey.replaceAll("_", "-");
}

export function funnelBlockHref(blockKey: string): string {
  return `/acquisition/${funnelBlockSlug(blockKey)}`;
}

export function funnelBlockKeyFromSlug(slug: string, catalog: FunnelBlockCatalogEntry[]): string | null {
  return catalog.find((entry) => entry.family !== "source" && (funnelBlockSlug(entry.blockKey) === slug || entry.blockKey === slug))?.blockKey ?? null;
}

export function activeFunnelBlockRoutes(
  selection: FunnelBlockSelection,
  catalog: FunnelBlockCatalogEntry[]
): Array<{ key: string; href: string; label: string; family: FunnelBlockCatalogEntry["family"] }> {
  const byKey = new Map(catalog.map((entry) => [entry.blockKey, entry]));
  return selection.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => byKey.get(item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined)
    .map((entry) => ({ key: entry.blockKey, href: funnelBlockHref(entry.blockKey), label: entry.label, family: entry.family }));
}
