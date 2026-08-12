export const FUNNEL_BLOCK_FAMILIES = ["source", "capture", "nurturing", "conversion"] as const;
export type FunnelBlockFamily = (typeof FUNNEL_BLOCK_FAMILIES)[number];

export const FUNNEL_SOURCE_KEYS = [
  "organique",
  "ads",
  "newsletter",
  "bouche_a_oreille",
  "communaute_externe",
] as const;
export type FunnelSourceKey = (typeof FUNNEL_SOURCE_KEYS)[number];

export const DEFAULT_CAPTURE_BLOCK_KEYS = [
  "lead_magnet",
  "vsl",
  "quiz",
  "page_de_vente",
  "inscription_event",
  "aucune_capture",
] as const;

export const DEFAULT_NURTURING_BLOCK_KEYS = [
  "communaute_freemium",
  "sequence_email",
  "challenge",
  "webinaire",
  "setting_dm",
  "aucune_nurturing",
] as const;

export const DEFAULT_CONVERSION_BLOCK_KEYS = [
  "appel",
  "checkout_direct",
  "offre_fin_event",
] as const;

export type FunnelBlockStep = {
  order: number;
  metricKey: string;
  label: string;
  unit: string;
  benchmarkKey: string | null;
};

export type FunnelBlockCatalogEntry = {
  blockKey: string;
  family: FunnelBlockFamily;
  label: string;
  description: string;
  steps: FunnelBlockStep[];
  example: string;
};

export type FunnelBlockSelectionItem = {
  blockKey: string;
  order: number;
};

export type FunnelBlockSelection = {
  blocks: FunnelBlockSelectionItem[];
  sources: FunnelSourceKey[];
  inferred: boolean;
};

export function isFunnelBlockFamily(value: unknown): value is FunnelBlockFamily {
  return typeof value === "string" && (FUNNEL_BLOCK_FAMILIES as readonly string[]).includes(value);
}

export function isFunnelSourceKey(value: unknown): value is FunnelSourceKey {
  return typeof value === "string" && (FUNNEL_SOURCE_KEYS as readonly string[]).includes(value);
}
