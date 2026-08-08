"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  improvementEvents,
  metaAdAccounts,
  metaAdActionLogs,
  metaAdSets,
  metaAds,
  metaAdsConnections,
  metaCampaignProfiles,
  metaCampaigns,
} from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import { decrypt } from "@/lib/crypto";
import { createMetaTouchpoint } from "@/lib/meta-ads/attribution";
import { getMetaObject, MetaApiError, parseMetaOptionalNumber, updateMetaObject } from "@/lib/meta-ads/client";
import { materializeMetaAdsInsights } from "@/lib/meta-ads/insights";
import { metaAdsManagerUrl, normalizeAdAccountId } from "@/lib/meta-ads/protocol";
import { getMetaAdsDashboard } from "@/lib/meta-ads/queries";
import { buildMetaTrackingUrl } from "@/lib/meta-ads/tracking";
import { isMetaTokenExpiredError } from "@/lib/meta-ads/sync-state";
import { META_CAMPAIGN_TYPES, type MetaEntityLevel } from "@/lib/meta-ads/types";
import { metaActionSchema } from "@/lib/meta-ads/action-validation";
import { requireOwner } from "@/lib/team/context";

export type MetaActionResult = {
  error: string | null;
  needsWriteAccess?: boolean;
  status?: string;
  deepLink?: string;
};

const configuredBudgetChangePercent = Number(process.env.META_MAX_DAILY_BUDGET_CHANGE_PERCENT);
const MAX_DAILY_BUDGET_CHANGE_FRACTION = Number.isFinite(configuredBudgetChangePercent) && configuredBudgetChangePercent > 0 && configuredBudgetChangePercent <= 100
  ? configuredBudgetChangePercent / 100
  : 0.5;

type MetaActionEntityType = Extract<MetaEntityLevel, "campaign" | "adset" | "ad">;

type MetaActionTarget = {
  entityType: MetaActionEntityType;
  id: string;
  externalId: string;
  name: string;
  adAccountId: string;
  adAccountExternalId: string;
  campaignId: string;
  campaignExternalId: string;
  adSetExternalId: string | null;
  adExternalId: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudgetCents: number | null;
};

async function insertMetaActionLog(params: {
  accountId: string;
  adAccountId: string;
  entityType: MetaActionEntityType;
  entityExternalId: string;
  actionType: string;
  idempotencyKey: string;
  status: string;
  requestedState: Record<string, unknown>;
  currentState: Record<string, unknown> | null;
  resultState?: Record<string, unknown> | null;
  errorMessage?: string | null;
  completedAt?: Date | null;
}): Promise<string> {
  const [row] = await db
    .insert(metaAdActionLogs)
    .values({
      userId: params.accountId,
      adAccountId: params.adAccountId,
      entityType: params.entityType,
      entityExternalId: params.entityExternalId,
      actionType: params.actionType,
      idempotencyKey: params.idempotencyKey,
      status: params.status,
      requestedState: params.requestedState,
      currentState: params.currentState,
      resultState: params.resultState ?? null,
      errorMessage: params.errorMessage ?? null,
      completedAt: params.completedAt ?? null,
    })
    .returning({ id: metaAdActionLogs.id });
  if (!row) throw new Error("L'audit Meta n'a pas pu être écrit.");
  return row.id;
}

async function recordMetaActionInJournal(params: {
  accountId: string;
  logId: string;
  campaignName: string;
  actionType: string;
  status: string;
}): Promise<void> {
  await db.insert(improvementEvents).values({
    userId: params.accountId,
    date: new Date().toISOString().slice(0, 10),
    type: "meta_ads_action",
    label: `Meta Ads · ${params.actionType} · ${params.campaignName} · ${params.status}`,
    sourceId: params.logId,
  });
}

async function finishMetaActionLog(params: {
  accountId: string;
  logId: string;
  campaignName: string;
  actionType: string;
  status: string;
  resultState?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const completedAt = new Date();
  await db
    .update(metaAdActionLogs)
    .set({
      status: params.status,
      resultState: params.resultState ?? null,
      errorMessage: params.errorMessage?.slice(0, 500) ?? null,
      completedAt,
    })
    .where(and(eq(metaAdActionLogs.id, params.logId), eq(metaAdActionLogs.userId, params.accountId)));
  await recordMetaActionInJournal({ ...params, status: params.status });
}

function isMetaWritePermissionError(error: unknown): boolean {
  return error instanceof MetaApiError && (error.code === 10 || error.code === 200);
}

async function markMetaWritePermissionMissing(accountId: string): Promise<void> {
  const [connection] = await db
    .select({ grantedScopes: metaAdsConnections.grantedScopes })
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, accountId))
    .limit(1);
  if (!connection) return;
  await db
    .update(metaAdsConnections)
    .set({
      grantedScopes: connection.grantedScopes.filter((scope) => scope !== "ads_management"),
      updatedAt: new Date(),
    })
    .where(eq(metaAdsConnections.userId, accountId));
}

async function markMetaTokenExpired(accountId: string): Promise<void> {
  try {
    await db
      .update(metaAdsConnections)
      .set({ status: "token_expired", lastSyncError: "Le jeton Meta a expiré. Reconnecte Meta Ads.", updatedAt: new Date() })
      .where(eq(metaAdsConnections.userId, accountId));
  } catch {
    // Keep the action result honest even if the connection-health projection
    // cannot be persisted during the same failed request.
  }
}

async function loadMetaActionTarget(params: {
  accountId: string;
  connectionId: string;
  selectedAdAccountExternalId: string;
  entityType: MetaActionEntityType;
  entityId: string;
}): Promise<MetaActionTarget | null> {
  const [account] = await db
    .select({ id: metaAdAccounts.id, externalId: metaAdAccounts.externalId, canRead: metaAdAccounts.canRead })
    .from(metaAdAccounts)
    .where(
      and(
        eq(metaAdAccounts.userId, params.accountId),
        eq(metaAdAccounts.connectionId, params.connectionId),
        eq(metaAdAccounts.externalId, params.selectedAdAccountExternalId),
      ),
    )
    .limit(1);
  if (!account?.canRead) return null;

  if (params.entityType === "campaign") {
    const [campaign] = await db
      .select()
      .from(metaCampaigns)
      .where(and(eq(metaCampaigns.id, params.entityId), eq(metaCampaigns.userId, params.accountId), eq(metaCampaigns.adAccountId, account.id)))
      .limit(1);
    if (!campaign) return null;
    return {
      entityType: "campaign",
      id: campaign.id,
      externalId: campaign.externalId,
      name: campaign.name,
      adAccountId: campaign.adAccountId,
      adAccountExternalId: account.externalId,
      campaignId: campaign.id,
      campaignExternalId: campaign.externalId,
      adSetExternalId: null,
      adExternalId: null,
      status: campaign.status,
      effectiveStatus: campaign.effectiveStatus,
      dailyBudgetCents: campaign.dailyBudgetCents,
    };
  }

  if (params.entityType === "adset") {
    const [row] = await db
      .select({ adSet: metaAdSets, campaignExternalId: metaCampaigns.externalId })
      .from(metaAdSets)
      .innerJoin(metaCampaigns, eq(metaCampaigns.id, metaAdSets.campaignId))
      .where(and(eq(metaAdSets.id, params.entityId), eq(metaAdSets.userId, params.accountId), eq(metaAdSets.adAccountId, account.id)))
      .limit(1);
    if (!row) return null;
    return {
      entityType: "adset",
      id: row.adSet.id,
      externalId: row.adSet.externalId,
      name: row.adSet.name,
      adAccountId: row.adSet.adAccountId,
      adAccountExternalId: account.externalId,
      campaignId: row.adSet.campaignId,
      campaignExternalId: row.campaignExternalId,
      adSetExternalId: row.adSet.externalId,
      adExternalId: null,
      status: row.adSet.status,
      effectiveStatus: row.adSet.effectiveStatus,
      dailyBudgetCents: row.adSet.dailyBudgetCents,
    };
  }

  const [row] = await db
    .select({ ad: metaAds, adSetExternalId: metaAdSets.externalId, campaignExternalId: metaCampaigns.externalId })
    .from(metaAds)
    .innerJoin(metaAdSets, eq(metaAdSets.id, metaAds.adSetId))
    .innerJoin(metaCampaigns, eq(metaCampaigns.id, metaAds.campaignId))
    .where(and(eq(metaAds.id, params.entityId), eq(metaAds.userId, params.accountId), eq(metaAds.adAccountId, account.id)))
    .limit(1);
  if (!row) return null;
  return {
    entityType: "ad",
    id: row.ad.id,
    externalId: row.ad.externalId,
    name: row.ad.name,
      adAccountId: row.ad.adAccountId,
      adAccountExternalId: account.externalId,
    campaignId: row.ad.campaignId,
    campaignExternalId: row.campaignExternalId,
    adSetExternalId: row.adSetExternalId,
    adExternalId: row.ad.externalId,
    status: row.ad.status,
    effectiveStatus: row.ad.effectiveStatus,
    dailyBudgetCents: null,
  };
}

async function updateMetaActionTargetCache(
  target: MetaActionTarget,
  accountId: string,
  resultState: Record<string, unknown>,
  desiredStatus: string | null,
  requestedBudget: number | null,
  verifiedBudget: number | null,
  updatedAt: Date,
): Promise<void> {
  const status = typeof resultState.status === "string" ? resultState.status : desiredStatus ?? target.status;
  const effectiveStatus = typeof resultState.effective_status === "string" ? resultState.effective_status : desiredStatus ?? target.effectiveStatus;
  const dailyBudgetCents = requestedBudget === null
    ? target.dailyBudgetCents
    : verifiedBudget === null
      ? requestedBudget
      : Math.round(verifiedBudget);

  if (target.entityType === "campaign") {
    await db
      .update(metaCampaigns)
      .set({ status, effectiveStatus, dailyBudgetCents, updatedAt })
      .where(and(eq(metaCampaigns.id, target.id), eq(metaCampaigns.userId, accountId)));
    return;
  }
  if (target.entityType === "adset") {
    await db
      .update(metaAdSets)
      .set({ status, effectiveStatus, dailyBudgetCents, lastSeenAt: updatedAt })
      .where(and(eq(metaAdSets.id, target.id), eq(metaAdSets.userId, accountId)));
    return;
  }
  await db
    .update(metaAds)
    .set({ status, effectiveStatus, lastSeenAt: updatedAt })
    .where(and(eq(metaAds.id, target.id), eq(metaAds.userId, accountId)));
}

const campaignProfileSchema = z.object({
  campaignId: z.string().uuid(),
  campaignType: z.enum(META_CAMPAIGN_TYPES),
});

const campaignTargetsSchema = z.object({
  campaignId: z.string().uuid(),
  targetCpaCents: z.number().int().min(1).max(10_000_000).nullable(),
  targetRoas: z.number().min(0).max(100).nullable(),
  leadValueCents: z.number().int().min(0).max(100_000_000).nullable(),
});

async function refreshCurrentMetaInsights(accountId: string): Promise<void> {
  try {
    const dashboard = await getMetaAdsDashboard(accountId);
    if (dashboard) await materializeMetaAdsInsights(accountId, dashboard);
  } catch (error) {
    console.error("Meta Ads insight refresh after campaign settings change failed", error instanceof Error ? error.message : "unknown");
  }
}

export async function setMetaCampaignType(input: unknown): Promise<{ error: string | null }> {
  const parsed = campaignProfileSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Type de campagne invalide." };

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut classer une campagne Meta." };

  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection?.selectedAdAccountId) return { error: "Aucun compte publicitaire Meta n'est sélectionné." };
  const [selectedAccount] = await db
    .select({ id: metaAdAccounts.id, canRead: metaAdAccounts.canRead })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, access.accountId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, connection.selectedAdAccountId)))
    .limit(1);
  if (!selectedAccount?.canRead) return { error: "Compte publicitaire Meta introuvable ou indisponible." };

  const [campaign] = await db
    .select()
    .from(metaCampaigns)
    .where(and(eq(metaCampaigns.id, parsed.data.campaignId), eq(metaCampaigns.userId, access.accountId)))
    .limit(1);
  if (!campaign || campaign.adAccountId !== selectedAccount.id) return { error: "Campagne Meta introuvable." };

  const now = new Date();
  await db
    .insert(metaCampaignProfiles)
    .values({
      userId: access.accountId,
      campaignId: campaign.id,
      campaignType: parsed.data.campaignType,
      typeSource: "manual",
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [metaCampaignProfiles.userId, metaCampaignProfiles.campaignId],
      set: { campaignType: parsed.data.campaignType, typeSource: "manual", updatedAt: now },
    });
  await db
    .update(metaCampaigns)
    .set({ campaignType: parsed.data.campaignType, updatedAt: now })
    .where(and(eq(metaCampaigns.id, campaign.id), eq(metaCampaigns.userId, access.accountId)));

  // Re-evaluate the current period immediately. The detail page filters out
  // the old type, so a failed refresh can only leave the page without stale
  // recommendations rather than showing rules for the previous module.
  await refreshCurrentMetaInsights(access.accountId);

  revalidatePath("/acquisition/ads");
  revalidatePath(`/acquisition/ads/meta/${campaign.id}`);
  return { error: null };
}

export async function setMetaCampaignTargets(input: unknown): Promise<{ error: string | null }> {
  const parsed = campaignTargetsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Cibles business invalides." };

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut configurer les cibles d’une campagne Meta." };

  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection?.selectedAdAccountId) return { error: "Aucun compte publicitaire Meta n'est sélectionné." };
  const [selectedAccount] = await db
    .select({ id: metaAdAccounts.id, canRead: metaAdAccounts.canRead })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, access.accountId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, connection.selectedAdAccountId)))
    .limit(1);
  if (!selectedAccount?.canRead) return { error: "Compte publicitaire Meta introuvable ou indisponible." };

  const [campaign] = await db
    .select({ id: metaCampaigns.id })
    .from(metaCampaigns)
    .where(and(eq(metaCampaigns.id, parsed.data.campaignId), eq(metaCampaigns.userId, access.accountId), eq(metaCampaigns.adAccountId, selectedAccount.id)))
    .limit(1);
  if (!campaign) return { error: "Campagne Meta introuvable." };

  const now = new Date();
  await db
    .insert(metaCampaignProfiles)
    .values({
      userId: access.accountId,
      campaignId: campaign.id,
      targetCpaCents: parsed.data.targetCpaCents,
      targetRoas: parsed.data.targetRoas,
      leadValueCents: parsed.data.leadValueCents,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [metaCampaignProfiles.userId, metaCampaignProfiles.campaignId],
      set: {
        targetCpaCents: parsed.data.targetCpaCents,
        targetRoas: parsed.data.targetRoas,
        leadValueCents: parsed.data.leadValueCents,
        updatedAt: now,
      },
    });

  await refreshCurrentMetaInsights(access.accountId);

  revalidatePath(`/acquisition/ads/meta/${campaign.id}`);
  revalidatePath("/acquisition/ads");
  return { error: null };
}

const touchpointLinkSchema = z.object({
  campaignId: z.string().uuid(),
  destinationUrl: z
    .string()
    .trim()
    .url("Entre une URL valide.")
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "L'URL doit commencer par http:// ou https://."),
});

export type MetaTouchpointLinkResult = { error: string | null; url?: string };

export async function createMetaCampaignTrackingLink(input: unknown): Promise<MetaTouchpointLinkResult> {
  const parsed = touchpointLinkSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "URL invalide." };

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut créer un lien de suivi Meta." };

  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection?.selectedAdAccountId) return { error: "Aucun compte publicitaire Meta n'est sélectionné." };
  const [selectedAccount] = await db
    .select({ id: metaAdAccounts.id, canRead: metaAdAccounts.canRead })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, access.accountId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, connection.selectedAdAccountId)))
    .limit(1);
  if (!selectedAccount?.canRead) return { error: "Compte publicitaire Meta introuvable ou indisponible." };

  const [campaign] = await db
    .select()
    .from(metaCampaigns)
    .where(and(eq(metaCampaigns.id, parsed.data.campaignId), eq(metaCampaigns.userId, access.accountId)))
    .limit(1);
  if (!campaign || campaign.adAccountId !== selectedAccount.id) return { error: "Campagne Meta introuvable." };

  const touchpoint = await createMetaTouchpoint({
    userId: access.accountId,
    campaignExternalId: campaign.externalId,
    utmSource: "meta",
    utmMedium: "paid_social",
    utmCampaign: `scale-x-${campaign.id.slice(0, 8)}`,
  });
  const url = buildMetaTrackingUrl(parsed.data.destinationUrl, {
    touchpointToken: touchpoint.token,
    campaignExternalId: campaign.externalId,
    utmSource: "meta",
    utmMedium: "paid_social",
    utmCampaign: `scale-x-${campaign.id.slice(0, 8)}`,
  });

  return { error: null, url };
}

export async function applyMetaCampaignAction(input: unknown): Promise<MetaActionResult> {
  const parsed = metaActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action Meta invalide." };

  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut modifier une campagne Meta." };

  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection?.selectedAdAccountId) return { error: "Aucun compte publicitaire Meta n'est sélectionné." };

  const targetId = parsed.data.entityId ?? parsed.data.campaignId;
  if (!targetId) return { error: "La cible Meta est introuvable." };
  const target = await loadMetaActionTarget({
    accountId: access.accountId,
    connectionId: connection.id,
    selectedAdAccountExternalId: connection.selectedAdAccountId,
    entityType: parsed.data.entityType,
    entityId: targetId,
  });
  if (!target) return { error: "Cible Meta introuvable dans le compte publicitaire sélectionné." };

  const idempotencyKey = parsed.data.idempotencyKey;
  const [existingLog] = await db
    .select({ status: metaAdActionLogs.status, errorMessage: metaAdActionLogs.errorMessage })
    .from(metaAdActionLogs)
    .where(and(eq(metaAdActionLogs.userId, access.accountId), eq(metaAdActionLogs.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existingLog) {
    return existingLog.status === "succeeded"
      ? { error: null, status: existingLog.status }
      : {
          error: existingLog.errorMessage ?? "Cette action a déjà été traitée.",
          status: existingLog.status,
          needsWriteAccess: existingLog.status === "permission_insufficient",
          deepLink: metaAdsManagerUrl(connection.selectedAdAccountId, target.campaignExternalId, target.adSetExternalId, target.adExternalId),
        };
  }

  const deepLink = metaAdsManagerUrl(connection.selectedAdAccountId, target.campaignExternalId, target.adSetExternalId, target.adExternalId);
  const desiredStatus = parsed.data.actionType === "pause" ? "PAUSED" : parsed.data.actionType === "resume" ? "ACTIVE" : null;
  const requestedState: Record<string, unknown> = desiredStatus
    ? { status: desiredStatus }
    : { daily_budget: parsed.data.dailyBudgetCents };

  if (!connection.grantedScopes.includes("ads_management")) {
    const logId = await insertMetaActionLog({
      accountId: access.accountId,
      adAccountId: target.adAccountId,
      entityType: target.entityType,
      entityExternalId: target.externalId,
      actionType: parsed.data.actionType,
      idempotencyKey,
      status: "permission_insufficient",
      requestedState,
      currentState: null,
      errorMessage: "La permission ads_management n'est pas accordée.",
      completedAt: new Date(),
    });
    await recordMetaActionInJournal({
      accountId: access.accountId,
      logId,
      campaignName: target.name,
      actionType: parsed.data.actionType,
      status: "permission_insufficient",
    });
    return {
      error: "Autorise d’abord les actions Meta Ads. Aucune écriture n’a été tentée.",
      needsWriteAccess: true,
      status: "permission_insufficient",
      deepLink,
    };
  }

  if (!connection.accessTokenEncrypted) {
    const message = "Reconnecte Meta Ads avant d’appliquer une action.";
    const logId = await insertMetaActionLog({
      accountId: access.accountId,
      adAccountId: target.adAccountId,
      entityType: target.entityType,
      entityExternalId: target.externalId,
      actionType: parsed.data.actionType,
      idempotencyKey,
      status: "permission_insufficient",
      requestedState,
      currentState: null,
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "permission_insufficient" });
    return { error: message, status: "permission_insufficient", deepLink };
  }
  let accessToken: string;
  try {
    accessToken = decrypt(connection.accessTokenEncrypted);
  } catch {
    const message = "Le jeton Meta ne peut pas être relu. Reconnecte Meta Ads avant d’appliquer une action.";
    const logId = await insertMetaActionLog({
      accountId: access.accountId,
      adAccountId: target.adAccountId,
      entityType: target.entityType,
      entityExternalId: target.externalId,
      actionType: parsed.data.actionType,
      idempotencyKey,
      status: "failed",
      requestedState,
      currentState: null,
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "failed" });
    return { error: message, status: "failed", deepLink };
  }
  let currentState: Record<string, unknown>;
  try {
    currentState = await getMetaObject(accessToken, target.externalId, "id,status,effective_status,daily_budget,lifetime_budget,account_id");
  } catch (error) {
    const message = error instanceof MetaApiError ? error.message : "Impossible de relire la campagne dans Meta.";
    const logId = await insertMetaActionLog({
      accountId: access.accountId,
      adAccountId: target.adAccountId,
      entityType: target.entityType,
      entityExternalId: target.externalId,
      actionType: parsed.data.actionType,
      idempotencyKey,
      status: "failed",
      requestedState,
      currentState: null,
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "failed" });
    return { error: message, status: "failed", deepLink };
  }

  const actualStatus = typeof currentState.effective_status === "string" ? currentState.effective_status : typeof currentState.status === "string" ? currentState.status : null;
  const currentDailyBudgetCents = parseMetaOptionalNumber(currentState.daily_budget);
  const currentAccountId = typeof currentState.account_id === "string" ? normalizeAdAccountId(currentState.account_id) : null;
  if (currentAccountId && currentAccountId !== normalizeAdAccountId(target.adAccountExternalId)) {
    const message = "Meta a renvoyé un objet qui n’appartient pas au compte publicitaire sélectionné.";
    const logId = await insertMetaActionLog({
      accountId: access.accountId,
      adAccountId: target.adAccountId,
      entityType: target.entityType,
      entityExternalId: target.externalId,
      actionType: parsed.data.actionType,
      idempotencyKey,
      status: "failed",
      requestedState,
      currentState,
      errorMessage: message,
      completedAt: new Date(),
    });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "failed" });
    return { error: message, status: "failed", deepLink };
  }
  if (parsed.data.expectedStatus && parsed.data.expectedStatus !== actualStatus) {
    const message = `La campagne a changé dans Meta (${actualStatus ?? "état inconnu"}) depuis la proposition.`;
    const logId = await insertMetaActionLog({ accountId: access.accountId, adAccountId: target.adAccountId, entityType: target.entityType, entityExternalId: target.externalId, actionType: parsed.data.actionType, idempotencyKey, status: "changed_between_proposal", requestedState, currentState, errorMessage: message, completedAt: new Date() });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "changed_between_proposal" });
    return { error: message, status: "changed_between_proposal", deepLink };
  }
  if (parsed.data.expectedDailyBudgetCents !== undefined && parsed.data.expectedDailyBudgetCents !== currentDailyBudgetCents) {
    const message = `Le budget a changé dans Meta depuis la proposition (${currentDailyBudgetCents === null ? "inconnu" : `${Math.round(currentDailyBudgetCents)} cents`}).`;
    const logId = await insertMetaActionLog({ accountId: access.accountId, adAccountId: target.adAccountId, entityType: target.entityType, entityExternalId: target.externalId, actionType: parsed.data.actionType, idempotencyKey, status: "changed_between_proposal", requestedState, currentState, errorMessage: message, completedAt: new Date() });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "changed_between_proposal" });
    return { error: message, status: "changed_between_proposal", deepLink };
  }

  const requestedBudget = parsed.data.dailyBudgetCents ?? null;
  if (requestedBudget !== null && currentDailyBudgetCents === null) {
    const message = "Le budget quotidien actuel n’est pas exposé par Meta. Ouvre Meta Ads pour vérifier avant de modifier ce budget.";
    const logId = await insertMetaActionLog({ accountId: access.accountId, adAccountId: target.adAccountId, entityType: target.entityType, entityExternalId: target.externalId, actionType: parsed.data.actionType, idempotencyKey, status: "blocked", requestedState, currentState, errorMessage: message, completedAt: new Date() });
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "blocked" });
    return { error: message, status: "blocked", deepLink };
  }
  if (requestedBudget !== null && currentDailyBudgetCents !== null && currentDailyBudgetCents > 0) {
    const variation = Math.abs(requestedBudget - currentDailyBudgetCents) / currentDailyBudgetCents;
    if (variation > MAX_DAILY_BUDGET_CHANGE_FRACTION) {
      const message = `Cette variation de budget dépasse la limite Scale X de ${MAX_DAILY_BUDGET_CHANGE_FRACTION * 100} %. Ouvre Meta Ads pour une modification plus importante.`;
      const logId = await insertMetaActionLog({ accountId: access.accountId, adAccountId: target.adAccountId, entityType: target.entityType, entityExternalId: target.externalId, actionType: parsed.data.actionType, idempotencyKey, status: "blocked", requestedState, currentState, errorMessage: message, completedAt: new Date() });
      await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "blocked" });
      return { error: message, status: "blocked", deepLink };
    }
  }

  const alreadyApplied = desiredStatus
    ? actualStatus === desiredStatus
    : requestedBudget !== null && currentDailyBudgetCents !== null && Math.round(currentDailyBudgetCents) === requestedBudget;

  const logId = await insertMetaActionLog({
    accountId: access.accountId,
    adAccountId: target.adAccountId,
    entityType: target.entityType,
    entityExternalId: target.externalId,
    actionType: parsed.data.actionType,
    idempotencyKey,
    status: alreadyApplied ? "succeeded" : "in_progress",
    requestedState,
    currentState,
    resultState: alreadyApplied ? currentState : null,
    completedAt: alreadyApplied ? new Date() : null,
  });
  if (alreadyApplied) {
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "succeeded" });
    return { error: null, status: "succeeded" };
  }

  try {
    await updateMetaObject({
      accessToken,
      objectId: target.externalId,
      values: desiredStatus ? { status: desiredStatus } : { daily_budget: parsed.data.dailyBudgetCents ?? 0 },
    });
    let resultState: Record<string, unknown>;
    try {
      resultState = await getMetaObject(accessToken, target.externalId, "id,status,effective_status,daily_budget,lifetime_budget,account_id");
    } catch {
      const message = "Meta a accepté la requête, mais l’état final n’a pas pu être relu. Nouvelle synchronisation nécessaire.";
      await finishMetaActionLog({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "unknown", errorMessage: message });
      return { error: message, status: "unknown", deepLink };
    }
    const verifiedStatus = typeof resultState.effective_status === "string" ? resultState.effective_status : typeof resultState.status === "string" ? resultState.status : null;
    const verifiedBudget = parseMetaOptionalNumber(resultState.daily_budget);
    const resultAccountId = typeof resultState.account_id === "string" ? normalizeAdAccountId(resultState.account_id) : null;
    if (resultAccountId && resultAccountId !== normalizeAdAccountId(target.adAccountExternalId)) {
      const message = "La relecture Meta a renvoyé un autre compte publicitaire. État inconnu, vérifie dans Meta Ads.";
      await finishMetaActionLog({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "unknown", resultState, errorMessage: message });
      return { error: message, status: "unknown", deepLink };
    }
    const verified = desiredStatus
      ? verifiedStatus === desiredStatus
      : requestedBudget !== null && verifiedBudget !== null && Math.round(verifiedBudget) === requestedBudget;
    if (!verified) {
      const message = "La valeur relue dans Meta ne correspond pas à la demande. Vérifie la campagne dans Meta Ads.";
      await finishMetaActionLog({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "unknown", resultState, errorMessage: message });
      return { error: message, status: "unknown", deepLink };
    }
    const completedAt = new Date();
    await db
      .update(metaAdActionLogs)
      .set({ status: "succeeded", resultState, completedAt })
      .where(and(eq(metaAdActionLogs.id, logId), eq(metaAdActionLogs.userId, access.accountId)));
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status: "succeeded" });
    await updateMetaActionTargetCache(target, access.accountId, resultState, desiredStatus, requestedBudget, verifiedBudget, completedAt);
    revalidatePath("/acquisition/ads");
    revalidatePath(`/acquisition/ads/meta/${target.campaignId}`);
    return { error: null, status: "succeeded" };
  } catch (error) {
    const message = error instanceof MetaApiError ? error.message : "La modification Meta a échoué.";
    const permissionRevoked = isMetaWritePermissionError(error);
    const tokenExpired = isMetaTokenExpiredError(error);
    if (permissionRevoked) await markMetaWritePermissionMissing(access.accountId);
    if (tokenExpired) await markMetaTokenExpired(access.accountId);
    const status = permissionRevoked ? "permission_insufficient" : "failed";
    await db
      .update(metaAdActionLogs)
      .set({ status, errorCode: error instanceof MetaApiError && error.code !== null ? String(error.code) : "unknown", errorMessage: message.slice(0, 500), completedAt: new Date() })
      .where(and(eq(metaAdActionLogs.id, logId), eq(metaAdActionLogs.userId, access.accountId)));
    await recordMetaActionInJournal({ accountId: access.accountId, logId, campaignName: target.name, actionType: parsed.data.actionType, status });
    return {
      error: permissionRevoked
        ? "Meta n’autorise plus cette écriture. La lecture reste active ; autorise à nouveau ads_management avant de confirmer."
        : tokenExpired
          ? "Le jeton Meta a expiré. Reconnecte Meta Ads avant de confirmer l’action."
          : message,
      status,
      needsWriteAccess: permissionRevoked,
      deepLink,
    };
  }
}
