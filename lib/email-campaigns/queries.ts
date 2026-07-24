import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { emailCampaigns } from "@/db/schema";

import type { EmailCampaignInput } from "./schema";
import type { EmailCampaignRow } from "./types";

function toRow(row: typeof emailCampaigns.$inferSelect): EmailCampaignRow {
  return {
    id: row.id,
    name: row.name,
    sentAt: row.sentAt,
    subject: row.subject,
    sends: row.sends,
    opens: row.opens,
    clicks: row.clicks,
    revenueAttributed: row.revenueAttributed,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getEmailCampaigns(userId: string): Promise<EmailCampaignRow[]> {
  const rows = await db
    .select()
    .from(emailCampaigns)
    .where(eq(emailCampaigns.userId, userId))
    .orderBy(desc(emailCampaigns.sentAt));

  return rows.map(toRow);
}

export async function createEmailCampaign(userId: string, data: EmailCampaignInput): Promise<void> {
  await db.insert(emailCampaigns).values({ userId, ...data });
}

export async function updateEmailCampaign(userId: string, id: string, data: EmailCampaignInput): Promise<void> {
  await db.update(emailCampaigns).set(data).where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.userId, userId)));
}

export async function deleteEmailCampaign(userId: string, id: string): Promise<void> {
  await db.delete(emailCampaigns).where(and(eq(emailCampaigns.id, id), eq(emailCampaigns.userId, userId)));
}
