import type { BusinessAcquisition } from "@/lib/business/types";
import type { ContentMetricKey } from "@/lib/diagnostic/content-metrics";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";

import { DEFAULT_ACQUISITION_FUNNELS } from "./catalog";
import {
  ACQUISITION_FUNNEL_KEYS,
  type AcquisitionFunnelKey,
  type AcquisitionFunnelCatalogEntry,
  type AcquisitionFunnelSelection,
  isAcquisitionFunnelKey,
} from "./types";

export function inferAcquisitionFunnelKeys(acquisition: Pick<BusinessAcquisition, "leadMagnet" | "vsl" | "setting">): AcquisitionFunnelKey[] {
  const inferred: AcquisitionFunnelKey[] = [];
  if (acquisition.leadMagnet.enabled === "yes") inferred.push("lead_magnet");
  if (acquisition.vsl.enabled === "yes") inferred.push("vsl");
  if (acquisition.setting.enabled === "yes") inferred.push("setting_dm");
  return inferred.length > 0 ? inferred : ["lead_magnet"];
}

export function normalizeAcquisitionSelection(
  acquisition: Partial<Pick<BusinessAcquisition, "funnels" | "primaryFunnel">> & Pick<BusinessAcquisition, "leadMagnet" | "vsl" | "setting">,
  catalog: AcquisitionFunnelCatalogEntry[] = DEFAULT_ACQUISITION_FUNNELS
): AcquisitionFunnelSelection {
  const available = new Set(catalog.map((entry) => entry.funnelKey));
  const rawFunnels = Array.isArray(acquisition.funnels) ? acquisition.funnels.filter((key): key is AcquisitionFunnelKey => isAcquisitionFunnelKey(key) && available.has(key)) : [];
  const funnels = rawFunnels.length > 0 ? Array.from(new Set(rawFunnels)) : inferAcquisitionFunnelKeys(acquisition);
  const rawPrimary = acquisition.primaryFunnel;
  const primaryFunnel = isAcquisitionFunnelKey(rawPrimary) && funnels.includes(rawPrimary) ? rawPrimary : funnels[0] ?? "lead_magnet";

  return {
    funnels: funnels.length > 0 ? funnels : [ACQUISITION_FUNNEL_KEYS[0]],
    primaryFunnel,
    inferred: rawFunnels.length === 0,
  };
}

export function activeFunnelEntries(selection: AcquisitionFunnelSelection, catalog: AcquisitionFunnelCatalogEntry[]): AcquisitionFunnelCatalogEntry[] {
  const byKey = new Map(catalog.map((entry) => [entry.funnelKey, entry]));
  return selection.funnels.map((key) => byKey.get(key)).filter((entry): entry is AcquisitionFunnelCatalogEntry => entry !== undefined);
}

export function activeBenchmarkKeys(selection: AcquisitionFunnelSelection, catalog: AcquisitionFunnelCatalogEntry[]): string[] {
  return Array.from(new Set(activeFunnelEntries(selection, catalog).flatMap((entry) => entry.steps.map((stage) => stage.benchmarkKey).filter((key): key is string => key !== null))));
}

export function activeLegacyMetricKeys(
  selection: AcquisitionFunnelSelection,
  catalog: AcquisitionFunnelCatalogEntry[]
): MetricKey[] {
  const inputKeys = new Set(activeFunnelEntries(selection, catalog).flatMap((entry) => entry.steps.map((step) => step.inputMetricKey)));
  const keys: MetricKey[] = [];
  if (inputKeys.has("first_messages")) keys.push("responseRate");
  if (inputKeys.has("conversations")) keys.push("proposalRate");
  if (inputKeys.has("calls_proposed")) keys.push("bookingRate");
  if (inputKeys.has("calls_booked")) keys.push("showUpRate");
  if (inputKeys.has("calls_attended")) keys.push("closingRate");
  return keys;
}

export function activeContentMetricKeys(
  selection: AcquisitionFunnelSelection,
  catalog: AcquisitionFunnelCatalogEntry[]
): ContentMetricKey[] {
  const inputKeys = new Set(activeFunnelEntries(selection, catalog).flatMap((entry) => entry.steps.map((step) => step.inputMetricKey)));
  if (!inputKeys.has("content_views")) return [];
  return ["content_click_rate", "content_lead_rate", "content_booking_rate", "content_close_rate"];
}
