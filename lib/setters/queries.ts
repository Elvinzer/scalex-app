import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sales, setters } from "@/db/schema";
import type { Offer } from "@/lib/business/types";
import { summarize } from "@/lib/sales/installments";

import type { SetterInput } from "./schema";
import type { SetterCommissions, SetterMonthlyCommission, SetterRow, SetterSaleDetail } from "./types";

function toRow(row: typeof setters.$inferSelect): SetterRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    defaultCommissionPct: row.defaultCommissionPct,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getSetters(userId: string): Promise<SetterRow[]> {
  const rows = await db.select().from(setters).where(eq(setters.userId, userId)).orderBy(setters.name);
  return rows.map(toRow);
}

// For the /acquisition/setters/[setterId] detail page — null both when the
// id doesn't exist and when it belongs to another account (same
// userId-scoped WHERE as every other query here, no separate ownership check).
export async function getSetter(userId: string, id: string): Promise<SetterRow | null> {
  const rows = await db.select().from(setters).where(and(eq(setters.id, id), eq(setters.userId, userId))).limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

export async function createSetter(userId: string, data: SetterInput): Promise<SetterRow> {
  const [row] = await db.insert(setters).values({ userId, ...data }).returning();
  return toRow(row);
}

export async function updateSetter(
  userId: string,
  id: string,
  data: Partial<SetterInput & { active: boolean }>
): Promise<void> {
  await db.update(setters).set(data).where(and(eq(setters.id, id), eq(setters.userId, userId)));
}

// Commission per sale, computed at read time — NEVER stored. Priority:
// the sold offer's own commissionSetterPct (business_profile.sales.offers,
// §F) > this setter's defaultCommissionPct. Every row in `sales` is by
// definition a validated sale (there's no "draft sale" concept — a lead
// still in the Kanban has no row here at all), so "never count an
// unvalidated sale" is structural, not an extra filter.
export async function computeSetterCommissions(userId: string, setterId: string, offers: Offer[]): Promise<SetterCommissions> {
  const setter = await db.select().from(setters).where(and(eq(setters.id, setterId), eq(setters.userId, userId))).limit(1);
  const defaultCommissionPct = setter[0]?.defaultCommissionPct ?? 0;

  const setterSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, userId), eq(sales.setterId, setterId)));

  let commissionPaidEur = 0;
  let commissionUpcomingEur = 0;
  let validatedRevenueEur = 0;
  const details: SetterSaleDetail[] = [];
  // Keyed by "YYYY-MM" (sale.saleDate's own month, not a payment/due date —
  // installments don't carry per-sale-per-month commission attribution, so
  // a sale's whole paid/upcoming split lands in the month it was sold).
  const monthlyMap = new Map<string, { paidEur: number; upcomingEur: number }>();

  for (const sale of setterSales) {
    const offer = offers.find((o) => o.id === sale.offerId);
    const commissionPct = offer?.commissionSetterPct ?? defaultCommissionPct;
    const { paidTotal, overallStatus } = summarize(sale.totalPrice, sale.installments);
    const upcomingTotal = sale.totalPrice - paidTotal;
    const salePaidCommission = paidTotal * commissionPct;
    const saleUpcomingCommission = upcomingTotal * commissionPct;

    commissionPaidEur += salePaidCommission;
    commissionUpcomingEur += saleUpcomingCommission;
    validatedRevenueEur += sale.totalPrice;

    const month = sale.saleDate.slice(0, 7);
    const bucket = monthlyMap.get(month) ?? { paidEur: 0, upcomingEur: 0 };
    bucket.paidEur += salePaidCommission;
    bucket.upcomingEur += saleUpcomingCommission;
    monthlyMap.set(month, bucket);

    details.push({
      saleId: sale.id,
      clientName: sale.clientName,
      offerId: sale.offerId,
      offerName: offer?.name ?? null,
      saleDate: sale.saleDate,
      totalPrice: sale.totalPrice,
      commissionPct,
      commissionAmount: sale.totalPrice * commissionPct,
      paymentStatus: overallStatus === "paid_full" ? "payee" : "a_venir",
    });
  }

  const monthly: SetterMonthlyCommission[] = Array.from(monthlyMap.entries())
    .map(([month, { paidEur, upcomingEur }]) => ({ month, paidEur: Math.round(paidEur), upcomingEur: Math.round(upcomingEur) }))
    .sort((a, b) => b.month.localeCompare(a.month));

  return {
    validatedSalesCount: setterSales.length,
    validatedRevenueEur,
    commissionPaidEur: Math.round(commissionPaidEur),
    commissionUpcomingEur: Math.round(commissionUpcomingEur),
    sales: details.sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    monthly,
  };
}
