import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { sales, salesCalls } from "@/db/schema";

import { summarize } from "@/lib/sales/installments";

export type CallAttendance = "booked" | "showed" | "no_show" | "cancelled";
export type CallOutcome = "pending" | "closed" | "not_closed";

// Serializable shape for the client table. Money is read from the LINKED sale
// (never duplicated on the call), then flattened here for display: contracted =
// sale.totalPrice, collected = the paid part of its installment schedule — the
// same source of truth the /ventes/suivi page uses.
export type SalesCallRow = {
  id: string;
  source: string; // "iclosed" | "calendly"
  inviteeName: string | null;
  inviteeEmail: string | null;
  scheduledAt: string; // ISO
  closer: string | null;
  eventType: string | null;
  attendance: CallAttendance;
  outcome: CallOutcome;
  saleId: string | null;
  contracted: number | null;
  collected: number | null;
  outcomeSetAt: string | null;
};

export async function getSalesCalls(accountId: string): Promise<SalesCallRow[]> {
  const rows = await db
    .select({ call: salesCalls, sale: sales })
    .from(salesCalls)
    .leftJoin(sales, eq(salesCalls.saleId, sales.id))
    .where(eq(salesCalls.userId, accountId))
    .orderBy(desc(salesCalls.scheduledAt));

  return rows.map(({ call, sale }) => ({
    id: call.id,
    source: call.source,
    inviteeName: call.inviteeName,
    inviteeEmail: call.inviteeEmail,
    scheduledAt: call.scheduledAt.toISOString(),
    closer: call.closer,
    eventType: call.eventType,
    attendance: call.attendance,
    outcome: call.outcome,
    saleId: call.saleId,
    contracted: sale ? sale.totalPrice : null,
    collected: sale ? summarize(sale.totalPrice, sale.installments).paidTotal : null,
    outcomeSetAt: call.outcomeSetAt ? call.outcomeSetAt.toISOString() : null,
  }));
}
