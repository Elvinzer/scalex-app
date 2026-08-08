import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  metaAdAccounts,
  metaAdMetricCorrections,
  metaAdMetricsDaily,
  metaAdSets,
  metaAds,
  metaAdsConnections,
  metaCampaignProfiles,
  metaCampaigns,
} from "@/db/schema";
import { decrypt } from "@/lib/crypto";

import {
  listMetaAdSets,
  listMetaAds,
  listMetaAdAccounts,
  listMetaCampaigns,
  listMetaInsights,
  MetaApiError,
  normalizeMetaObject,
  parseMetaOptionalNumber,
} from "./client";
import { classifyMetaCampaign } from "./classification";
import { materializeMetaAdsInsights } from "./insights";
import { parseMetaInsightMetrics } from "./metric-parser";
import { buildMetaMetricCorrectionSnapshot, metaMetricCorrectionSnapshotChanged } from "./metric-snapshot";
import { metaConnectionFailureStatus, metaSyncErrorMessage } from "./sync-state";
import { getMetaAdsDashboard } from "./queries";
import {
  META_DEFAULT_ATTRIBUTION_SETTINGS,
  META_SYNC_PHASES,
  META_SYNC_LOOKBACK_DAYS,
  META_SYNC_TIME_BUDGET_MS,
  type MetaAdsSyncPhase,
  computeMetaConsolidationUntil,
  normalizeAdAccountId,
} from "./protocol";
import type { MetaAttributionSettings, MetaEntityLevel, MetaRawObject } from "./types";

function stringValue(raw: MetaRawObject, key: string): string | null {
  const value = raw[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function numberValue(raw: MetaRawObject, key: string): number | null {
  return parseMetaOptionalNumber(raw[key]);
}

function integerValue(raw: MetaRawObject, key: string): number | null {
  const value = numberValue(raw, key);
  return value === null ? null : Math.max(0, Math.round(value));
}

function nestedRecord(raw: MetaRawObject, key: string): MetaRawObject | null {
  return normalizeMetaObject(raw[key]);
}

function dateValue(raw: MetaRawObject, key: string): Date | null {
  const value = stringValue(raw, key);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDateValue(raw: MetaRawObject, key: string, fallback: string): string {
  const value = stringValue(raw, key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function budgetCents(raw: MetaRawObject, key: string): number | null {
  const value = numberValue(raw, key);
  return value === null ? null : Math.max(0, Math.round(value));
}

function accountExternalId(raw: MetaRawObject): string | null {
  const id = stringValue(raw, "id") ?? stringValue(raw, "account_id");
  return id ? normalizeAdAccountId(id) : null;
}

type SyncMetricLevel = MetaEntityLevel | "placement";

function entityIdForLevel(raw: MetaRawObject, level: SyncMetricLevel, adAccountId: string): string {
  if (level === "placement") {
    const campaignId = stringValue(raw, "campaign_id") ?? "unknown-campaign";
    const publisherPlatform = stringValue(raw, "publisher_platform") ?? "unknown-publisher";
    const platformPosition = stringValue(raw, "platform_position") ?? "unknown-position";
    return `${campaignId}:${publisherPlatform}:${platformPosition}`;
  }
  if (level === "campaign") return stringValue(raw, "campaign_id") ?? "unknown-campaign";
  if (level === "adset") return stringValue(raw, "adset_id") ?? "unknown-adset";
  if (level === "ad") return stringValue(raw, "ad_id") ?? "unknown-ad";
  return normalizeAdAccountId(stringValue(raw, "account_id") ?? adAccountId);
}

function parseAttributionSettings(value?: MetaAttributionSettings): MetaAttributionSettings {
  return value ?? META_DEFAULT_ATTRIBUTION_SETTINGS;
}

async function persistMetaSyncFailure(userId: string, error: unknown): Promise<void> {
  try {
    await db
      .update(metaAdsConnections)
      .set({
        status: metaConnectionFailureStatus(error),
        initialSyncStatus: "failed",
        lastSyncError: metaSyncErrorMessage(error).slice(0, 500),
        updatedAt: new Date(),
      })
      .where(eq(metaAdsConnections.userId, userId));
  } catch {
    // Preserve the original Meta/database error for the caller. The next
    // refresh can still retry even if this health projection itself fails.
  }
}

async function getConnection(userId: string) {
  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, userId))
    .limit(1);
  if (!connection || connection.status === "disconnected" || !connection.accessTokenEncrypted) {
    throw new MetaApiError("Meta Ads est déconnecté. Reconnecte Meta Ads pour reprendre la synchronisation.", { code: 190 });
  }
  if (connection.tokenExpiresAt && connection.tokenExpiresAt <= new Date()) {
    const error = new MetaApiError("Le jeton Meta a expiré. Reconnecte Meta Ads.", { code: 190 });
    await persistMetaSyncFailure(userId, error);
    throw error;
  }
  return connection;
}

function decryptConnectionToken(connection: typeof metaAdsConnections.$inferSelect): string {
  if (!connection.accessTokenEncrypted) {
    throw new MetaApiError("Le jeton Meta est indisponible. Reconnecte Meta Ads.", { code: 190 });
  }
  return decrypt(connection.accessTokenEncrypted);
}

export async function syncMetaAdAccounts(userId: string): Promise<{ imported: number; selectedAdAccountId: string | null }> {
  const connection = await getConnection(userId);
  try {
    const accessToken = decryptConnectionToken(connection);
    const rows = await listMetaAdAccounts(accessToken);
    let imported = 0;

    for (const raw of rows) {
      const externalId = accountExternalId(raw);
      if (!externalId) continue;
      const name = stringValue(raw, "name") ?? externalId;
      const accountStatus = integerValue(raw, "account_status");
      const values = {
        userId,
        connectionId: connection.id,
        externalId,
        name,
        currency: stringValue(raw, "currency"),
        timezone: stringValue(raw, "timezone_name"),
        accountStatus,
        disableReason: stringValue(raw, "disable_reason"),
        canRead: accountStatus === null || accountStatus === 1,
        lastSeenAt: new Date(),
        raw,
      };
      await db
        .insert(metaAdAccounts)
        .values(values)
        .onConflictDoUpdate({
          target: [metaAdAccounts.userId, metaAdAccounts.externalId],
          set: values,
        });
      imported += 1;
    }

    await db
      .update(metaAdsConnections)
      .set({ initialSyncStatus: connection.selectedAdAccountId ? "pending" : "awaiting_account", lastSyncError: null, updatedAt: new Date() })
      .where(eq(metaAdsConnections.userId, userId));
    return { imported, selectedAdAccountId: connection.selectedAdAccountId };
  } catch (error) {
    await persistMetaSyncFailure(userId, error);
    throw error;
  }
}

async function upsertCampaigns(userId: string, adAccountId: string, raws: MetaRawObject[]) {
  const campaignIds = new Map<string, string>();
  const now = new Date();
  for (const raw of raws) {
    const externalId = stringValue(raw, "id");
    if (!externalId) continue;
    const classification = classifyMetaCampaign(raw);
    const values = {
      userId,
      adAccountId,
      externalId,
      name: stringValue(raw, "name") ?? externalId,
      objective: stringValue(raw, "objective"),
      performanceGoal: stringValue(raw, "optimization_goal"),
      status: stringValue(raw, "status"),
      effectiveStatus: stringValue(raw, "effective_status"),
      campaignType: classification.type,
      typeConfidence: classification.confidence,
      landingPageUrl: stringValue(nestedRecord(raw, "promoted_object") ?? {}, "website_url"),
      dailyBudgetCents: budgetCents(raw, "daily_budget"),
      lifetimeBudgetCents: budgetCents(raw, "lifetime_budget"),
      startTime: dateValue(raw, "start_time"),
      stopTime: dateValue(raw, "stop_time"),
      raw,
      lastSeenAt: now,
      updatedAt: now,
    };
    const [row] = await db
      .insert(metaCampaigns)
      .values(values)
      .onConflictDoUpdate({
        target: [metaCampaigns.userId, metaCampaigns.adAccountId, metaCampaigns.externalId],
        set: {
          adAccountId,
          name: values.name,
          objective: values.objective,
          performanceGoal: values.performanceGoal,
          status: values.status,
          effectiveStatus: values.effectiveStatus,
          campaignType: values.campaignType,
          typeConfidence: values.typeConfidence,
          landingPageUrl: values.landingPageUrl,
          dailyBudgetCents: values.dailyBudgetCents,
          lifetimeBudgetCents: values.lifetimeBudgetCents,
          startTime: values.startTime,
          stopTime: values.stopTime,
          raw,
          lastSeenAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: metaCampaigns.id, externalId: metaCampaigns.externalId });
    if (row) campaignIds.set(row.externalId, row.id);
    if (row) {
      await db
        .insert(metaCampaignProfiles)
        .values({
          userId,
          campaignId: row.id,
          campaignType: classification.type,
          typeSource: "heuristic",
        })
        .onConflictDoUpdate({
          target: [metaCampaignProfiles.userId, metaCampaignProfiles.campaignId],
          set: {
            campaignType: classification.type,
            typeSource: "heuristic",
            updatedAt: now,
          },
          setWhere: ne(metaCampaignProfiles.typeSource, "manual"),
        });
    }
  }
  return campaignIds;
}

async function upsertAdSets(userId: string, adAccountId: string, raws: MetaRawObject[], campaignIds: Map<string, string>) {
  const adSetIds = new Map<string, { id: string; campaignId: string }>();
  const now = new Date();
  for (const raw of raws) {
    const externalId = stringValue(raw, "id");
    const externalCampaignId = stringValue(raw, "campaign_id");
    const campaignId = externalCampaignId ? campaignIds.get(externalCampaignId) : null;
    if (!externalId || !campaignId) continue;
    const values = {
      userId,
      adAccountId,
      campaignId,
      externalId,
      name: stringValue(raw, "name") ?? externalId,
      status: stringValue(raw, "status"),
      effectiveStatus: stringValue(raw, "effective_status"),
      targeting: nestedRecord(raw, "targeting"),
      dailyBudgetCents: budgetCents(raw, "daily_budget"),
      lifetimeBudgetCents: budgetCents(raw, "lifetime_budget"),
      raw,
      lastSeenAt: now,
    };
    const [row] = await db
      .insert(metaAdSets)
      .values(values)
      .onConflictDoUpdate({
        target: [metaAdSets.userId, metaAdSets.adAccountId, metaAdSets.externalId],
        set: values,
      })
      .returning({ id: metaAdSets.id, externalId: metaAdSets.externalId });
    if (row) adSetIds.set(row.externalId, { id: row.id, campaignId });
  }
  return adSetIds;
}

async function upsertAds(
  userId: string,
  adAccountId: string,
  raws: MetaRawObject[],
  adSetIds: Map<string, { id: string; campaignId: string }>,
  campaignIds: Map<string, string>,
) {
  let imported = 0;
  const now = new Date();
  for (const raw of raws) {
    const externalId = stringValue(raw, "id");
    const externalAdSetId = stringValue(raw, "adset_id");
    const adSet = externalAdSetId ? adSetIds.get(externalAdSetId) : null;
    const externalCampaignId = stringValue(raw, "campaign_id");
    const campaignId = externalCampaignId ? campaignIds.get(externalCampaignId) ?? adSet?.campaignId : adSet?.campaignId;
    if (!externalId || !adSet || !campaignId) continue;
    const creative = nestedRecord(raw, "creative") ?? {};
    const values = {
      userId,
      adAccountId,
      adSetId: adSet.id,
      campaignId,
      externalId,
      name: stringValue(raw, "name") ?? externalId,
      status: stringValue(raw, "status"),
      effectiveStatus: stringValue(raw, "effective_status"),
      creativeName: stringValue(creative, "name"),
      thumbnailUrl: stringValue(creative, "thumbnail_url"),
      permalinkUrl: stringValue(raw, "permalink_url"),
      raw,
      lastSeenAt: now,
    };
    await db
      .insert(metaAds)
      .values(values)
      .onConflictDoUpdate({
        target: [metaAds.userId, metaAds.adAccountId, metaAds.externalId],
        set: values,
      });
    imported += 1;
  }
  return imported;
}

async function upsertMetrics(
  userId: string,
  adAccountId: string,
  level: SyncMetricLevel,
  raws: MetaRawObject[],
  attribution: MetaAttributionSettings,
  fallbackDate: string,
) {
  let imported = 0;
  for (const raw of raws) {
    const date = isoDateValue(raw, "date_start", fallbackDate);
    const dateEnd = isoDateValue(raw, "date_stop", date);
    const entityExternalId = entityIdForLevel(raw, level, adAccountId);
    const values = parseMetaInsightMetrics(raw);
    const entityKey = `${level}:${entityExternalId}`;
    const [existing] = await db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, userId),
          eq(metaAdMetricsDaily.adAccountId, adAccountId),
          eq(metaAdMetricsDaily.entityKey, entityKey),
          eq(metaAdMetricsDaily.date, date),
        ),
      )
      .limit(1);
    const beforeSnapshot = existing ? buildMetaMetricCorrectionSnapshot(existing as unknown as Record<string, unknown>) : null;
    const afterSnapshot = buildMetaMetricCorrectionSnapshot(values as unknown as Record<string, unknown>);
    if (existing?.consolidationUntil && existing.consolidationUntil <= new Date() && beforeSnapshot && metaMetricCorrectionSnapshotChanged(beforeSnapshot, afterSnapshot)) {
      await db.insert(metaAdMetricCorrections).values({
        userId,
        adAccountId,
        metricRowId: existing.id,
        level,
        entityKey,
        date,
        beforeSnapshot,
        afterSnapshot,
      });
    }
    await db
      .insert(metaAdMetricsDaily)
      .values({
        userId,
        adAccountId,
        level,
        entityKey,
        entityExternalId,
        campaignExternalId: stringValue(raw, "campaign_id"),
        adSetExternalId: stringValue(raw, "adset_id"),
        adExternalId: stringValue(raw, "ad_id"),
        date,
        dateEnd,
        ...values,
        attributionSettings: attribution,
        raw,
        consolidationUntil: computeMetaConsolidationUntil(date, attribution),
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [metaAdMetricsDaily.userId, metaAdMetricsDaily.adAccountId, metaAdMetricsDaily.entityKey, metaAdMetricsDaily.date],
        set: {
          dateEnd,
          ...values,
          attributionSettings: attribution,
          raw,
          consolidationUntil: computeMetaConsolidationUntil(date, attribution),
          syncedAt: new Date(),
        },
      });
    imported += 1;
  }
  return imported;
}

function lookbackRange(days: number): { since: string; until: string } {
  const until = new Date();
  const since = new Date(until);
  // Meta's date filters are inclusive at both ends; keep the requested
  // lookback length exact instead of fetching days + 1.
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const toDate = (value: Date) => value.toISOString().slice(0, 10);
  return { since: toDate(since), until: toDate(until) };
}

export async function syncSelectedMetaAdAccount(
  userId: string,
  attributionSettings?: MetaAttributionSettings,
  requestedPhase: MetaAdsSyncPhase = "catalog",
): Promise<{ campaigns: number; adSets: number; ads: number; metrics: number; completed: boolean; nextPhase: MetaAdsSyncPhase | null }> {
  const connection = await getConnection(userId);
  const selectedId = connection.selectedAdAccountId;
  if (!selectedId) throw new Error("Sélectionne un compte publicitaire Meta avant de synchroniser.");
  const [account] = await db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, userId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, normalizeAdAccountId(selectedId))))
    .limit(1);
  if (!account) throw new Error("Le compte publicitaire Meta sélectionné est introuvable.");
  if (!account.canRead) throw new Error("Le compte publicitaire Meta sélectionné n'est plus accessible en lecture.");

  const startedAt = new Date();
  await db
    .update(metaAdsConnections)
    .set({ lastSyncStartedAt: startedAt, lastSyncError: null, initialSyncStatus: "syncing", updatedAt: startedAt })
    .where(eq(metaAdsConnections.userId, userId));

  try {
    const accessToken = decryptConnectionToken(connection);
    const range = lookbackRange(META_SYNC_LOOKBACK_DAYS);
    const attribution = parseAttributionSettings(attributionSettings);
    let phase: MetaAdsSyncPhase = META_SYNC_PHASES.includes(requestedPhase) ? requestedPhase : "catalog";
    let campaignCount = 0;
    let adSetCount = 0;
    let importedAds = 0;
    let importedMetrics = 0;
    const deadline = Date.now() + META_SYNC_TIME_BUDGET_MS;
    const hasBudget = () => Date.now() < deadline;
    const partial = (nextPhase: MetaAdsSyncPhase) => ({
      campaigns: campaignCount,
      adSets: adSetCount,
      ads: importedAds,
      metrics: importedMetrics,
      completed: false,
      nextPhase,
    });

    // Each phase is idempotent and deliberately small enough to be replayed by
    // Inngest. The caller chains `nextPhase` when a serverless invocation is
    // close to its wall-clock ceiling, so a 90-day account never gets marked
    // complete after only the first Insights level was imported.
    while (phase !== "finalize") {
      if (!hasBudget()) return partial(phase);

      if (phase === "catalog") {
        const [campaignRaws, adSetRaws, adRaws] = await Promise.all([
          listMetaCampaigns(accessToken, account.externalId),
          listMetaAdSets(accessToken, account.externalId),
          listMetaAds(accessToken, account.externalId),
        ]);
        const campaignIds = await upsertCampaigns(userId, account.id, campaignRaws);
        const adSetIds = await upsertAdSets(userId, account.id, adSetRaws, campaignIds);
        campaignCount = campaignIds.size;
        adSetCount = adSetIds.size;
        importedAds = await upsertAds(userId, account.id, adRaws, adSetIds, campaignIds);
      } else if (phase === "account" || phase === "campaign" || phase === "adset" || phase === "ad") {
        const rows = await listMetaInsights({
          accessToken,
          adAccountId: account.externalId,
          level: phase,
          since: range.since,
          until: range.until,
          attributionSettings: attribution,
        });
        importedMetrics += await upsertMetrics(userId, account.id, phase, rows, attribution, range.since);
      } else if (phase === "placement") {
        try {
          const placementRows = await listMetaInsights({
            accessToken,
            adAccountId: account.externalId,
            level: "adset",
            since: range.since,
            until: range.until,
            attributionSettings: attribution,
            breakdowns: ["publisher_platform", "platform_position"],
          });
          importedMetrics += await upsertMetrics(userId, account.id, "placement", placementRows, attribution, range.since);
        } catch (error) {
          // Placement breakdowns are optional in Meta's response for some
          // accounts/objectives. The core sync remains usable and the UI
          // exposes the placement analysis as unavailable when no rows exist.
          console.warn("Meta placement breakdown unavailable", error instanceof MetaApiError ? error.message : "unknown error");
        }
      }

      const nextPhase = META_SYNC_PHASES[META_SYNC_PHASES.indexOf(phase) + 1];
      if (!nextPhase) break;
      phase = nextPhase;
      if (!hasBudget()) return partial(phase);
    }

    if (!hasBudget()) return partial("finalize");
    const dashboard = await getMetaAdsDashboard(userId);
    if (dashboard) await materializeMetaAdsInsights(userId, dashboard);
    const completedAt = new Date();
    await db
      .update(metaAdsConnections)
      .set({
        initialSyncStatus: "completed",
        initialSyncCompletedAt: connection.initialSyncCompletedAt ?? completedAt,
        lastSyncCompletedAt: completedAt,
        lastSyncError: null,
        updatedAt: completedAt,
      })
      .where(eq(metaAdsConnections.userId, userId));
    return { campaigns: campaignCount, adSets: adSetCount, ads: importedAds, metrics: importedMetrics, completed: true, nextPhase: null };
  } catch (error) {
    await persistMetaSyncFailure(userId, error);
    throw error;
  }
}

export function defaultMetaLookbackDays(): number {
  return META_SYNC_LOOKBACK_DAYS;
}
