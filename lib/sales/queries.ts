import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { sales } from "@/db/schema";

import { summarize } from "./installments";
import type { SaleInput } from "./schema";
import type { SaleRow } from "./types";

function toRow(row: typeof sales.$inferSelect): SaleRow {
  return {
    id: row.id,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    sourceChannel: row.sourceChannel,
    offerId: row.offerId,
    totalPrice: row.totalPrice,
    paymentType: row.paymentType,
    installments: row.installments,
    saleDate: row.saleDate,
    closer: row.closer,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getSales(userId: string): Promise<SaleRow[]> {
  const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.saleDate));
  return rows.map(toRow);
}

export async function getSalesForMonth(userId: string, year: number, month: number): Promise<SaleRow[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, userId), gte(sales.saleDate, from), lte(sales.saleDate, to)))
    .orderBy(desc(sales.saleDate));

  return rows.map(toRow);
}

// Powers the "Datas" month-modal suggestion banner: contracted/collected
// totals and closed-sale count per month for the whole year, computed here
// (not pre-aggregated in the LLM, not stored) — the modal only shows it as
// a dismissible suggestion, never auto-fills.
export async function getSalesSummaryByMonth(
  userId: string,
  year: number
): Promise<Record<number, { contracted: number; collected: number; closedCount: number }>> {
  const rows = await getSales(userId);
  const byMonth: Record<number, { contracted: number; collected: number; closedCount: number }> = {};

  for (const row of rows) {
    const [rowYear, rowMonth] = row.saleDate.split("-").map(Number);
    if (rowYear !== year) continue;

    const entry = byMonth[rowMonth] ?? { contracted: 0, collected: 0, closedCount: 0 };
    entry.contracted += row.totalPrice;
    entry.collected += summarize(row.totalPrice, row.installments).paidTotal;
    entry.closedCount += 1;
    byMonth[rowMonth] = entry;
  }

  return byMonth;
}

export async function createSale(userId: string, data: SaleInput): Promise<void> {
  await db.insert(sales).values({ userId, ...data });
}

export async function updateSale(userId: string, id: string, data: SaleInput): Promise<void> {
  await db.update(sales).set(data).where(and(eq(sales.id, id), eq(sales.userId, userId)));
}

export async function deleteSale(userId: string, id: string): Promise<void> {
  await db.delete(sales).where(and(eq(sales.id, id), eq(sales.userId, userId)));
}
