import type { BusinessAcquisition } from "@/lib/business/types";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";

import { DEFAULT_FUNNEL_BLOCKS } from "./catalog";
import type {
  FunnelBlockCatalogEntry,
  FunnelBlockSelection,
  FunnelBlockSelectionItem,
  FunnelSourceKey,
} from "./types";
import { isFunnelSourceKey } from "./types";

const LEGACY_TO_BLOCKS: Record<string, FunnelBlockSelectionItem[]> = {
  lead_magnet: [{ blockKey: "lead_magnet", order: 1 }, { blockKey: "appel", order: 3 }],
  vsl: [{ blockKey: "vsl", order: 1 }, { blockKey: "appel", order: 3 }],
  quiz: [{ blockKey: "quiz", order: 1 }, { blockKey: "appel", order: 3 }],
  appel_direct: [{ blockKey: "aucune_capture", order: 1 }, { blockKey: "appel", order: 3 }],
  setting_dm: [{ blockKey: "aucune_capture", order: 1 }, { blockKey: "setting_dm", order: 2 }, { blockKey: "appel", order: 3 }],
  webinaire: [{ blockKey: "inscription_event", order: 1 }, { blockKey: "webinaire", order: 2 }, { blockKey: "appel", order: 3 }],
  challenge: [{ blockKey: "inscription_event", order: 1 }, { blockKey: "challenge", order: 2 }, { blockKey: "appel", order: 3 }],
  newsletter: [{ blockKey: "aucune_capture", order: 1 }, { blockKey: "sequence_email", order: 2 }, { blockKey: "appel", order: 3 }],
  vente_directe: [{ blockKey: "page_de_vente", order: 1 }, { blockKey: "checkout_direct", order: 3 }],
  communaute: [{ blockKey: "aucune_capture", order: 1 }, { blockKey: "communaute_freemium", order: 2 }, { blockKey: "appel", order: 3 }],
};

const BLOCK_TO_LEGACY: Record<string, string> = {
  lead_magnet: "lead_magnet",
  vsl: "vsl",
  quiz: "quiz",
  page_de_vente: "vente_directe",
  inscription_event: "webinaire",
  communaute_freemium: "communaute",
  sequence_email: "newsletter",
  challenge: "challenge",
  webinaire: "webinaire",
  setting_dm: "setting_dm",
  appel: "appel_direct",
  checkout_direct: "vente_directe",
  offre_fin_event: "webinaire",
  aucune_capture: "appel_direct",
};

function catalogMap(catalog: FunnelBlockCatalogEntry[]): Map<string, FunnelBlockCatalogEntry> {
  return new Map(catalog.map((entry) => [entry.blockKey, entry]));
}

function inferredBlocks(acquisition: Pick<BusinessAcquisition, "funnels" | "primaryFunnel" | "leadMagnet" | "vsl" | "setting">): FunnelBlockSelectionItem[] {
  const legacyKey = acquisition.primaryFunnel && LEGACY_TO_BLOCKS[acquisition.primaryFunnel]
    ? acquisition.primaryFunnel
    : acquisition.funnels.find((key) => LEGACY_TO_BLOCKS[key]) ?? null;
  if (legacyKey && LEGACY_TO_BLOCKS[legacyKey]) return LEGACY_TO_BLOCKS[legacyKey];

  if (acquisition.vsl.enabled === "yes") return LEGACY_TO_BLOCKS.vsl;
  if (acquisition.setting.enabled === "yes") return LEGACY_TO_BLOCKS.setting_dm;
  return LEGACY_TO_BLOCKS.lead_magnet;
}

function inferredSources(acquisition: Pick<BusinessAcquisition, "sources" | "platforms">): FunnelSourceKey[] {
  const stored = Array.isArray(acquisition.sources) ? acquisition.sources.filter(isFunnelSourceKey) : [];
  if (stored.length > 0) return Array.from(new Set(stored));
  const platformNames = new Set(acquisition.platforms.map((platform) => platform.name.toLowerCase()));
  if (platformNames.has("newsletter")) return ["organique", "newsletter"];
  return ["organique"];
}

export function normalizeFunnelBlockSelection(
  acquisition: Partial<BusinessAcquisition>,
  catalog: FunnelBlockCatalogEntry[] = DEFAULT_FUNNEL_BLOCKS
): FunnelBlockSelection {
  const byKey = catalogMap(catalog);
  const rawBlocks = Array.isArray(acquisition.blocks) ? acquisition.blocks : [];
  const explicitBlocks = rawBlocks
    .filter((item): item is FunnelBlockSelectionItem => Boolean(item) && typeof item === "object" && typeof item.blockKey === "string" && Number.isInteger(item.order))
    .filter((item) => byKey.get(item.blockKey)?.family !== "source")
    .sort((a, b) => a.order - b.order)
    .filter((item, index, values) => values.findIndex((candidate) => candidate.blockKey === item.blockKey) === index);
  const sourceBlocks = explicitBlocks.length > 0
    ? explicitBlocks
    : inferredBlocks({
        funnels: Array.isArray(acquisition.funnels) ? acquisition.funnels : [],
        primaryFunnel: acquisition.primaryFunnel ?? "lead_magnet",
        leadMagnet: acquisition.leadMagnet ?? { enabled: null, type: null, title: "", promise: "", url: "" },
        vsl: acquisition.vsl ?? { enabled: null, url: "", durationMin: null, cta: "" },
        setting: acquisition.setting ?? { enabled: null, channel: "", operator: "" },
      }).filter((item) => byKey.has(item.blockKey));

  const normalized: FunnelBlockSelectionItem[] = [];
  let captureFound = false;
  let conversionFound = false;
  let nurturingCount = 0;
  for (const item of sourceBlocks) {
    const entry = byKey.get(item.blockKey);
    if (!entry || entry.family === "source") continue;
    if (entry.family === "capture") {
      if (captureFound) continue;
      captureFound = true;
    }
    if (entry.family === "conversion") {
      if (conversionFound) continue;
      conversionFound = true;
    }
    if (entry.family === "nurturing") {
      if (nurturingCount >= 2) continue;
      nurturingCount += 1;
    }
    normalized.push({ blockKey: item.blockKey, order: item.order });
  }

  if (!captureFound) normalized.unshift({ blockKey: byKey.has("lead_magnet") ? "lead_magnet" : "aucune_capture", order: 1 });
  if (!conversionFound) normalized.push({ blockKey: byKey.has("appel") ? "appel" : "checkout_direct", order: 3 });

  const ordered = normalized
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ blockKey: item.blockKey, order: index + 1 }));
  const sources = inferredSources({
    sources: acquisition.sources ?? [],
    platforms: acquisition.platforms ?? [],
  });

  return { blocks: ordered, sources, inferred: explicitBlocks.length === 0 };
}

export function activeFunnelBlockEntries(selection: FunnelBlockSelection, catalog: FunnelBlockCatalogEntry[]): FunnelBlockCatalogEntry[] {
  const byKey = catalogMap(catalog);
  return selection.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => byKey.get(item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined);
}

export function sequenceMetricKeys(selection: FunnelBlockSelection, catalog: FunnelBlockCatalogEntry[]): string[] {
  return Array.from(new Set(activeFunnelBlockEntries(selection, catalog).flatMap((entry) => entry.steps.map((step) => step.metricKey))));
}

export function legacyFunnelKeysForBlocks(selection: FunnelBlockSelection, catalog: FunnelBlockCatalogEntry[]): string[] {
  return Array.from(new Set(activeFunnelBlockEntries(selection, catalog).map((entry) => BLOCK_TO_LEGACY[entry.blockKey]).filter((key): key is string => Boolean(key))));
}

export function activeLegacyMetricKeysFromBlocks(selection: FunnelBlockSelection, catalog: FunnelBlockCatalogEntry[]): MetricKey[] {
  const keys = new Set(sequenceMetricKeys(selection, catalog));
  return [
    ...(keys.has("first_messages") ? ["responseRate" as const] : []),
    ...(keys.has("conversations") ? ["proposalRate" as const] : []),
    ...(keys.has("calls_proposed") ? ["bookingRate" as const] : []),
    ...(keys.has("calls_booked") ? ["showUpRate" as const] : []),
    ...(keys.has("calls_attended") ? ["closingRate" as const] : []),
  ];
}

export function isFunnelBlockActive(selection: FunnelBlockSelection, blockKey: string): boolean {
  return selection.blocks.some((item) => item.blockKey === blockKey);
}
