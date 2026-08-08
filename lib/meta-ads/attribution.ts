import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, gt, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { metaAdTouchpoints } from "@/db/schema";
import { META_TOUCHPOINT_TTL_DAYS } from "./protocol";
import type { MetaAttributionSnapshot } from "./types";

export const META_TOUCHPOINT_QUERY_KEY = "sx_mt";

export function hashMetaTouchpointToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function snapshot(row: typeof metaAdTouchpoints.$inferSelect): MetaAttributionSnapshot {
  const level = row.adExternalId ? "ad" : row.adSetExternalId ? "adset" : row.campaignExternalId ? "campaign" : "utm_seul";
  return {
    touchpointId: row.id,
    campaignExternalId: row.campaignExternalId,
    adSetExternalId: row.adSetExternalId,
    adExternalId: row.adExternalId,
    level,
  };
}

export async function createMetaTouchpoint(params: {
  userId: string;
  campaignExternalId?: string | null;
  adSetExternalId?: string | null;
  adExternalId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  expiresAt?: Date | null;
}): Promise<{ token: string; touchpointId: string }> {
  const token = randomBytes(32).toString("hex");
  const capturedAt = new Date();
  const expiresAt = params.expiresAt ?? new Date(capturedAt.getTime() + META_TOUCHPOINT_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(metaAdTouchpoints)
    .values({
      userId: params.userId,
      tokenHash: hashMetaTouchpointToken(token),
      campaignExternalId: params.campaignExternalId ?? null,
      adSetExternalId: params.adSetExternalId ?? null,
      adExternalId: params.adExternalId ?? null,
      utmSource: params.utmSource ?? null,
      utmMedium: params.utmMedium ?? null,
      utmCampaign: params.utmCampaign ?? null,
      utmContent: params.utmContent ?? null,
      utmTerm: params.utmTerm ?? null,
      capturedAt,
      expiresAt,
    })
    .returning({ id: metaAdTouchpoints.id });
  if (!row) throw new Error("Le touchpoint Meta n'a pas pu être créé.");
  return { token, touchpointId: row.id };
}

export async function resolveMetaTouchpoint(userId: string, token: string | null | undefined): Promise<MetaAttributionSnapshot | null> {
  const trimmed = token?.trim() ?? "";
  if (!/^[a-f0-9]{64}$/i.test(trimmed)) return null;
  const now = new Date();
  const [row] = await db
    .select()
    .from(metaAdTouchpoints)
    .where(
      and(
        eq(metaAdTouchpoints.userId, userId),
        eq(metaAdTouchpoints.tokenHash, hashMetaTouchpointToken(trimmed)),
        or(isNull(metaAdTouchpoints.expiresAt), gt(metaAdTouchpoints.expiresAt, now)),
      ),
    )
    .limit(1);
  if (!row) return null;
  await db.update(metaAdTouchpoints).set({ lastUsedAt: now }).where(eq(metaAdTouchpoints.id, row.id));
  return snapshot(row);
}

// Fallback for Calendly/iClosed payloads that preserve UTM values but cannot
// carry the first-party token. It is intentionally only a lookup against a
// touchpoint already created by the account, never a claim that an arbitrary
// browser-provided campaign name is a Meta id.
export async function resolveMetaTouchpointFromUtm(params: {
  userId: string;
  utmCampaign?: string | null;
  utmContent?: string | null;
}): Promise<MetaAttributionSnapshot | null> {
  if (!params.utmCampaign && !params.utmContent) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(metaAdTouchpoints)
    .where(
      and(
        eq(metaAdTouchpoints.userId, params.userId),
        params.utmCampaign ? eq(metaAdTouchpoints.utmCampaign, params.utmCampaign) : undefined,
        params.utmContent ? eq(metaAdTouchpoints.utmContent, params.utmContent) : undefined,
        isNull(metaAdTouchpoints.adSetExternalId),
        isNull(metaAdTouchpoints.adExternalId),
        or(isNull(metaAdTouchpoints.expiresAt), gt(metaAdTouchpoints.expiresAt, now)),
      ),
    )
    .orderBy(desc(metaAdTouchpoints.capturedAt))
    .limit(2);
  if (rows.length === 0) return null;
  const campaignIds = new Set(rows.map((row) => row.campaignExternalId).filter((value): value is string => Boolean(value)));
  if (campaignIds.size > 1) return null;
  return snapshot(rows[0]!);
}

export async function resolveMetaTouchpointFromIdentifiers(params: {
  userId: string;
  campaignExternalId?: string | null;
  adSetExternalId?: string | null;
  adExternalId?: string | null;
}): Promise<MetaAttributionSnapshot | null> {
  if (!params.campaignExternalId && !params.adSetExternalId && !params.adExternalId) return null;
  const now = new Date();
  const rows = await db
    .select()
    .from(metaAdTouchpoints)
    .where(
      and(
        eq(metaAdTouchpoints.userId, params.userId),
        params.campaignExternalId ? eq(metaAdTouchpoints.campaignExternalId, params.campaignExternalId) : undefined,
        params.adSetExternalId ? eq(metaAdTouchpoints.adSetExternalId, params.adSetExternalId) : undefined,
        params.adExternalId ? eq(metaAdTouchpoints.adExternalId, params.adExternalId) : undefined,
        or(isNull(metaAdTouchpoints.expiresAt), gt(metaAdTouchpoints.expiresAt, now)),
      ),
    )
    .orderBy(desc(metaAdTouchpoints.capturedAt))
    .limit(2);
  if (rows.length === 0) return null;
  const exactIds = new Set(
    rows.map((row) => `${row.campaignExternalId ?? ""}:${row.adSetExternalId ?? ""}:${row.adExternalId ?? ""}`),
  );
  return exactIds.size === 1 ? snapshot(rows[0]!) : null;
}
