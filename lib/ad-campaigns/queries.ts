import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { adCampaigns } from "@/db/schema";

import type { AdCampaignInput } from "./schema";
import type { AdCampaignRow } from "./types";

function toRow(row: typeof adCampaigns.$inferSelect): AdCampaignRow {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    objective: row.objective,
    budget: row.budget,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    leads: row.leads,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAdCampaigns(userId: string): Promise<AdCampaignRow[]> {
  const rows = await db
    .select()
    .from(adCampaigns)
    .where(eq(adCampaigns.userId, userId))
    .orderBy(desc(adCampaigns.startDate));

  return rows.map(toRow);
}

export async function createAdCampaign(userId: string, data: AdCampaignInput): Promise<void> {
  await db.insert(adCampaigns).values({ userId, ...data });
}

export async function updateAdCampaign(userId: string, id: string, data: AdCampaignInput): Promise<void> {
  await db.update(adCampaigns).set(data).where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)));
}

export async function deleteAdCampaign(userId: string, id: string): Promise<void> {
  await db.delete(adCampaigns).where(and(eq(adCampaigns.id, id), eq(adCampaigns.userId, userId)));
}
