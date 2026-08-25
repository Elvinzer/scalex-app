import { and, desc, eq, gte, lte } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { sales } from "@/db/schema";

import { summarize } from "./installments";
import type { SaleInput } from "./schema";
import { isInstallmentPaymentSale, type SaleRow } from "./types";

export type MonthlySalesSummary = {
  contracted: number;
  collected: number;
  closedCount: number;
  bankTransferCustomers: number;
};

function toRow(row: typeof sales.$inferSelect): SaleRow {
  return {
    id: row.id,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    sourceChannel: row.sourceChannel,
    offerId: row.offerId,
    totalPrice: row.totalPrice,
    paymentType: row.paymentType,
    paymentMethod: row.paymentMethod,
    source: row.source,
    isOrphan: row.isOrphan,
    stripeCustomerId: row.stripeCustomerId,
    installments: row.installments,
    saleDate: row.saleDate,
    closer: row.closer,
    hasUpsell: row.hasUpsell,
    upsellOfferId: row.upsellOfferId,
    upsellAmount: row.upsellAmount,
    setterId: row.setterId,
    leadId: row.leadId,
    parentSaleId: row.parentSaleId,
    paymentNumber: row.paymentNumber,
    paymentCount: row.paymentCount,
    createdAt: row.createdAt.toISOString(),
  };
}

// Cached per-request (React's cache()) — buildVentesData (lib/agent/
// lever-agent-data.ts) fans out to 3 sub-builders that each call this
// independently for the same account within one Copilote page load; only
// read-only page renders call getSales (no Server Action reads-then-writes
// it in the same request), so memoizing here is safe and removes 3x
// redundant concurrent queries — same root cause and fix as
// lib/levers/catalog.ts's getLeversCatalog.
export const getSales = cache(async (userId: string): Promise<SaleRow[]> => {
  const rows = await db.select().from(sales).where(eq(sales.userId, userId)).orderBy(desc(sales.saleDate));
  return rows.map(toRow);
});

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
): Promise<Record<number, MonthlySalesSummary>> {
  const rows = await getSales(userId);
  const byMonth: Record<number, MonthlySalesSummary> = {};

  for (const row of rows) {
    if (row.isOrphan || isInstallmentPaymentSale(row)) continue;
    const [rowYear, rowMonth] = row.saleDate.split("-").map(Number);
    if (rowYear !== year) continue;

    const entry = byMonth[rowMonth] ?? { contracted: 0, collected: 0, closedCount: 0, bankTransferCustomers: 0 };
    entry.contracted += row.totalPrice;
    entry.collected += summarize(row.totalPrice, row.installments).paidTotal;
    entry.closedCount += 1;
    if (row.paymentMethod === "virement") entry.bankTransferCustomers += 1;
    byMonth[rowMonth] = entry;
  }

  return byMonth;
}

// Return type widened from void to { id } so callers that need the new
// row's id (the Pipeline's validate-sale action, to link the lead back)
// can get it without a second query — safe, the one pre-existing caller
// (/ventes/suivi/actions.ts's saveSale) already discards the return value.
export async function createSale(userId: string, data: SaleInput): Promise<{ id: string }> {
  const [row] = await db.insert(sales).values({ userId, ...data }).returning({ id: sales.id });
  return row;
}

export async function createInstallmentPaymentSale(
  userId: string,
  parentSaleId: string,
  installmentIndex: number,
  paidAt: string,
): Promise<{ id: string } | null> {
  const [parent] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, parentSaleId), eq(sales.userId, userId)))
    .limit(1);

  const installment = parent?.installments?.[installmentIndex];
  if (!parent || !parent.installments || !installment || installment.status !== "paid") return null;

  const paymentNumber = installmentIndex + 1;
  const existing = await db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.userId, userId), eq(sales.parentSaleId, parentSaleId), eq(sales.paymentNumber, paymentNumber)))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await db
    .insert(sales)
    .values({
      userId,
      clientName: parent.clientName,
      clientEmail: parent.clientEmail,
      sourceChannel: parent.sourceChannel,
      offerId: parent.offerId,
      totalPrice: installment.amount,
      paymentType: "one_shot",
      paymentMethod: parent.paymentMethod,
      source: "manual_installment_payment",
      isOrphan: false,
      stripeCustomerId: parent.stripeCustomerId,
      installments: null,
      saleDate: paidAt,
      closer: parent.closer,
      hasUpsell: false,
      upsellOfferId: null,
      upsellAmount: null,
      setterId: parent.setterId,
      leadId: parent.leadId,
      parentSaleId,
      paymentNumber,
      paymentCount: parent.installments.length,
    })
    .onConflictDoNothing({ target: [sales.parentSaleId, sales.paymentNumber] })
    .returning({ id: sales.id });

  if (!row) {
    const [existingRow] = await db
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.userId, userId), eq(sales.parentSaleId, parentSaleId), eq(sales.paymentNumber, paymentNumber)))
      .limit(1);
    return existingRow ?? null;
  }

  return row;
}

export async function updateSale(userId: string, id: string, data: SaleInput): Promise<void> {
  await db.update(sales).set(data).where(and(eq(sales.id, id), eq(sales.userId, userId)));
}

export async function deleteSale(userId: string, id: string): Promise<void> {
  await db.delete(sales).where(and(eq(sales.id, id), eq(sales.userId, userId)));
}
