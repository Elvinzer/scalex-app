"use server";

import { after } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { businessProfile } from "@/db/schema";
import { track } from "@/lib/analytics";
import { ACQUISITION_FUNNEL_KEYS, type AcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import { FUNNEL_SOURCE_KEYS, isFunnelSourceKey, type FunnelSourceKey } from "@/lib/funnel-blocks/types";
import { getBusinessProfile } from "@/lib/business/queries";
import { businessProfileSectionSchemas } from "@/lib/business/schema";
import { EMPTY_BUSINESS_PROFILE, type BusinessAcquisition } from "@/lib/business/types";
import { getMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { EMPTY_MONTHLY_METRICS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import { writeMonthlyMetrics } from "@/lib/monthly-metrics/write";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { requirePermission } from "@/lib/team/context";
import { createClient } from "@/lib/supabase/server";

const funnelKeySchema = z.enum(ACQUISITION_FUNNEL_KEYS);
const nullableCount = z.number().int().min(0).nullable();

const configSchemas: Record<AcquisitionFunnelKey, z.ZodTypeAny> = {
  lead_magnet: z.object({
    enabled: z.enum(["yes", "no"]).nullable().optional(),
    type: z.enum(["pdf", "video", "formation_gratuite", "communaute", "audit", "autre"]).nullable(),
    title: z.string().max(200),
    promise: z.string().max(1000),
    url: z.string().max(500),
  }),
  vsl: z.object({
    enabled: z.enum(["yes", "no"]).nullable().optional(),
    url: z.string().max(500),
    durationMin: nullableCount,
    cta: z.string().max(200),
  }),
  quiz: z.object({
    url: z.string().max(500),
    questionCount: nullableCount,
    tool: z.string().max(100),
  }),
  appel_direct: z.object({
    bookingUrl: z.string().max(500),
    calendarTool: z.string().max(100),
  }),
  setting_dm: z.object({
    enabled: z.enum(["yes", "no"]).nullable().optional(),
    channel: z.string().max(100),
    operator: z.string().max(100),
  }),
  webinaire: z.object({
    format: z.enum(["live", "evergreen"]).nullable(),
    frequency: z.string().max(100),
    url: z.string().max(500),
  }),
  challenge: z.object({
    durationDays: nullableCount,
    frequency: z.string().max(100),
    url: z.string().max(500),
  }),
  newsletter: z.object({
    tool: z.string().max(100),
    listSize: nullableCount,
    frequency: z.string().max(100),
  }),
  vente_directe: z.object({
    url: z.string().max(500),
    displayedPrice: z.number().nonnegative().nullable(),
  }),
  communaute: z.object({
    platform: z.string().max(100),
    memberCount: nullableCount,
  }),
};

const funnelMetricUpdatesSchema = z.object({
  scalar: z.object({
    cashCollected: nullableCount,
    cashContracted: nullableCount,
    newFollowers: nullableCount,
    firstMessages: nullableCount,
    conversations: nullableCount,
    callsProposed: nullableCount,
    callsBooked: nullableCount,
    callsTaken: nullableCount,
    salesClosed: nullableCount,
  }).partial().default({}),
  acquisitionMetrics: z.record(z.string().max(100), nullableCount).default({}),
});

function monthlyInputFromRow(row: Awaited<ReturnType<typeof getMonthlyMetrics>>): typeof EMPTY_MONTHLY_METRICS {
  return {
    cashCollected: row?.cashCollected ?? null,
    cashContracted: row?.cashContracted ?? null,
    newFollowers: row?.newFollowers ?? null,
    firstMessages: row?.firstMessages ?? null,
    conversations: row?.conversations ?? null,
    callsProposed: row?.callsProposed ?? null,
    callsBooked: row?.callsBooked ?? null,
    callsTaken: row?.callsTaken ?? null,
    salesClosed: row?.salesClosed ?? null,
    acquisitionMetrics: row?.acquisitionMetrics ?? {},
    acquisitionSourceMetrics: row?.acquisitionSourceMetrics ?? {},
  };
}

export async function saveAcquisitionFunnelConfiguration(
  funnelKey: string,
  data: unknown
): Promise<{ error: string | null }> {
  const parsedKey = funnelKeySchema.safeParse(funnelKey);
  if (!parsedKey.success) return { error: "Parcours inconnu." };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "business");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsedConfig = configSchemas[parsedKey.data].safeParse(data);
  if (!parsedConfig.success) return { error: parsedConfig.error.issues[0]?.message ?? "Configuration invalide." };

  const currentProfile = await getBusinessProfile(access.accountId);
  const currentAcquisition = currentProfile.acquisition;
  const nextAcquisition: BusinessAcquisition = { ...currentAcquisition };

  switch (parsedKey.data) {
    case "lead_magnet":
      nextAcquisition.leadMagnet = { ...currentAcquisition.leadMagnet, ...parsedConfig.data };
      break;
    case "vsl":
      nextAcquisition.vsl = { ...currentAcquisition.vsl, ...parsedConfig.data };
      break;
    case "setting_dm":
      nextAcquisition.setting = { ...currentAcquisition.setting, ...parsedConfig.data };
      break;
    default:
      nextAcquisition.configurations = {
        ...currentAcquisition.configurations,
        [parsedKey.data]: parsedConfig.data,
      };
  }

  const validatedAcquisition = businessProfileSectionSchemas.acquisition.safeParse(nextAcquisition);
  if (!validatedAcquisition.success) return { error: validatedAcquisition.error.issues[0]?.message ?? "Configuration invalide." };
  const persistedAcquisition = { ...validatedAcquisition.data };
  delete persistedAcquisition.funnelSelectionInferred;

  await db
    .insert(businessProfile)
    .values({ userId: access.accountId, ...EMPTY_BUSINESS_PROFILE, acquisition: persistedAcquisition })
    .onConflictDoUpdate({
      target: businessProfile.userId,
      set: { acquisition: persistedAcquisition, updatedAt: new Date() },
    });

  after(() => track("acquisition_data_saved", userId, {
    funnel_key: parsedKey.data,
    fields: Object.keys(parsedConfig.data),
    kind: "configuration",
  }));
  revalidateBusinessData(access.accountId);
  return { error: null };
}

export async function saveAcquisitionFunnelMetrics(
  funnelKey: string,
  year: number,
  month: number,
  data: unknown
): Promise<{ error: string | null }> {
  const parsedKey = funnelKeySchema.safeParse(funnelKey);
  const parsedYear = z.number().int().min(2000).max(2200).safeParse(year);
  const parsedMonth = z.number().int().min(1).max(12).safeParse(month);
  const parsedData = funnelMetricUpdatesSchema.safeParse(data);
  if (!parsedKey.success || !parsedYear.success || !parsedMonth.success || !parsedData.success) {
    return { error: "Les chiffres saisis sont invalides." };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "datas");
  if (!access) return { error: "Tu n'as pas accès à Mes chiffres." };

  const catalog = await getAcquisitionFunnelCatalog();
  const allowedMetricKeys = new Set(catalog.flatMap((entry) => entry.steps.map((step) => step.inputMetricKey)));
  const unknownMetric = Object.keys(parsedData.data.acquisitionMetrics).find((key) => !allowedMetricKeys.has(key));
  if (unknownMetric) return { error: "Cette métrique n'appartient à aucun parcours actif." };

  const existing = await getMonthlyMetrics(access.accountId, parsedYear.data, parsedMonth.data);
  const current = monthlyInputFromRow(existing);
  const scalar = parsedData.data.scalar;
  const next = {
    ...current,
    ...scalar,
    acquisitionMetrics: {
      ...current.acquisitionMetrics,
      ...parsedData.data.acquisitionMetrics,
    },
  };

  await writeMonthlyMetrics(access.accountId, parsedYear.data, parsedMonth.data, next);
  after(() => track("acquisition_data_saved", userId, {
    funnel_key: parsedKey.data,
    fields: [...Object.keys(scalar), ...Object.keys(parsedData.data.acquisitionMetrics)],
    kind: "metrics",
    month: `${parsedYear.data}-${String(parsedMonth.data).padStart(2, "0")}`,
  }));
  revalidateBusinessData(access.accountId);
  return { error: null };
}

const funnelBlockMetricsSchema = z.object({
  blockKey: z.string().min(1).max(100),
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  metrics: z.record(z.string().max(100), nullableCount).default({}),
  bySource: z.record(
    z.enum(FUNNEL_SOURCE_KEYS),
    z.record(z.string().max(100), nullableCount)
  ).default({}),
});

const BLOCK_SCALAR_FIELDS: Record<string, keyof Pick<MonthlyMetricsInput, "newFollowers" | "firstMessages" | "conversations" | "callsProposed" | "callsBooked" | "callsTaken" | "salesClosed">> = {
  new_followers: "newFollowers",
  first_messages: "firstMessages",
  conversations: "conversations",
  calls_proposed: "callsProposed",
  calls_booked: "callsBooked",
  calls_attended: "callsTaken",
  sales_closed: "salesClosed",
};

export async function saveFunnelBlockMetrics(data: unknown): Promise<{ error: string | null }> {
  const parsed = funnelBlockMetricsSchema.safeParse(data);
  if (!parsed.success) return { error: "Les chiffres saisis sont invalides." };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "datas");
  if (!access) return { error: "Tu n'as pas accès à Mes chiffres." };

  const [catalog, profile, existing] = await Promise.all([
    getFunnelBlockCatalog(),
    getBusinessProfile(access.accountId),
    getMonthlyMetrics(access.accountId, parsed.data.year, parsed.data.month),
  ]);
  const selection = normalizeFunnelBlockSelection(profile.acquisition, catalog);
  const entry = catalog.find((candidate) => candidate.blockKey === parsed.data.blockKey);
  if (!entry || !selection.blocks.some((item) => item.blockKey === parsed.data.blockKey)) {
    return { error: "Cette brique n'appartient pas à ton parcours actif." };
  }
  const allowedMetricKeys = new Set(entry.steps.map((step) => step.metricKey));
  const unknownMetric = Object.keys(parsed.data.metrics).find((key) => !allowedMetricKeys.has(key));
  if (unknownMetric) return { error: "Cette métrique n'appartient pas à cette brique." };
  for (const [source, metrics] of Object.entries(parsed.data.bySource)) {
    if (!isFunnelSourceKey(source)) return { error: "Cette source n'est pas reconnue." };
    if (!selection.sources.includes(source)) return { error: "Cette source n'est pas active dans ton parcours." };
    const unknownSourceMetric = Object.keys(metrics).find((key) => !allowedMetricKeys.has(key));
    if (unknownSourceMetric) return { error: "Cette métrique source n'appartient pas à cette brique." };
  }

  const current = monthlyInputFromRow(existing);
  const scalarPatch: Partial<Pick<MonthlyMetricsInput, "newFollowers" | "firstMessages" | "conversations" | "callsProposed" | "callsBooked" | "callsTaken" | "salesClosed">> = {};
  const acquisitionMetrics = { ...current.acquisitionMetrics };
  for (const [metricKey, value] of Object.entries(parsed.data.metrics)) {
    const scalarKey = BLOCK_SCALAR_FIELDS[metricKey];
    if (scalarKey) scalarPatch[scalarKey] = value;
    else acquisitionMetrics[metricKey] = value;
  }
  const acquisitionSourceMetrics = mergeSourceMetrics(current.acquisitionSourceMetrics ?? {}, parsed.data.bySource);
  for (const entryStep of entry.steps) {
    const sourceValues = Object.values(acquisitionSourceMetrics)
      .map((sourceMetrics) => sourceMetrics[entryStep.metricKey])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const explicitTotal = parsed.data.metrics[entryStep.metricKey];
    if (sourceValues.length === 0 || (explicitTotal !== undefined && explicitTotal !== null)) continue;
    const total = sourceValues.reduce((sum, value) => sum + value, 0);
    const scalarKey = BLOCK_SCALAR_FIELDS[entryStep.metricKey];
    if (scalarKey) scalarPatch[scalarKey] = total;
    else acquisitionMetrics[entryStep.metricKey] = total;
  }
  await writeMonthlyMetrics(access.accountId, parsed.data.year, parsed.data.month, {
    ...current,
    ...scalarPatch,
    acquisitionMetrics,
    acquisitionSourceMetrics,
  });
  after(() => track("acquisition_data_saved", userId, {
    block_key: parsed.data.blockKey,
    fields: Object.keys(parsed.data.metrics),
    source_fields: Object.fromEntries(Object.entries(parsed.data.bySource).map(([source, values]) => [source, Object.keys(values)])),
    kind: "metrics",
    month: `${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}`,
  }));
  revalidateBusinessData(access.accountId);
  return { error: null };
}

const blockConfigurationSchema = z.object({
  blockKey: z.string().min(1).max(100),
  values: z.record(z.string().max(100), z.union([z.string().max(1000), z.number().nonnegative(), z.null()])),
});

export async function saveFunnelBlockConfiguration(data: unknown): Promise<{ error: string | null }> {
  const parsed = blockConfigurationSchema.safeParse(data);
  if (!parsed.success) return { error: "La configuration de cette brique est invalide." };
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "business");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const [catalog, profile] = await Promise.all([getFunnelBlockCatalog(), getBusinessProfile(access.accountId)]);
  const selection = normalizeFunnelBlockSelection(profile.acquisition, catalog);
  if (!catalog.some((entry) => entry.blockKey === parsed.data.blockKey) || !selection.blocks.some((item) => item.blockKey === parsed.data.blockKey)) {
    return { error: "Cette brique n'appartient pas à ton parcours actif." };
  }
  const nextAcquisition: BusinessAcquisition = {
    ...profile.acquisition,
    blockConfigurations: {
      ...profile.acquisition.blockConfigurations,
      [parsed.data.blockKey]: parsed.data.values,
    },
  };
  const validated = businessProfileSectionSchemas.acquisition.safeParse(nextAcquisition);
  if (!validated.success) return { error: validated.error.issues[0]?.message ?? "Configuration invalide." };
  const persisted = { ...validated.data };
  delete persisted.funnelSelectionInferred;
  delete persisted.blockSelectionInferred;
  await db
    .insert(businessProfile)
    .values({ userId: access.accountId, ...EMPTY_BUSINESS_PROFILE, acquisition: persisted })
    .onConflictDoUpdate({ target: businessProfile.userId, set: { acquisition: persisted, updatedAt: new Date() } });
  after(() => track("acquisition_data_saved", userId, { block_key: parsed.data.blockKey, fields: Object.keys(parsed.data.values), kind: "configuration" }));
  revalidateBusinessData(access.accountId);
  return { error: null };
}

function mergeSourceMetrics(
  current: Record<string, Record<string, number | null>>,
  updates: Record<string, Record<string, number | null>>
): Record<string, Record<string, number | null>> {
  const merged = { ...current };
  for (const [source, metrics] of Object.entries(updates)) {
    const sourceKey = source as FunnelSourceKey;
    merged[sourceKey] = { ...(current[sourceKey] ?? {}), ...metrics };
  }
  return merged;
}
