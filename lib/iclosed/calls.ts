import { desc, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { sales, salesCallComments, salesCalls } from "@/db/schema";

import { summarize } from "@/lib/sales/installments";

export type CallAttendance = "booked" | "showed" | "no_show" | "cancelled";
export type CallOutcome = "pending" | "closed" | "not_closed" | "awaiting_decision";

// Serializable shape for the client table. Money is read from the LINKED sale
// (never duplicated on the call), then flattened here for display: contracted =
// sale.totalPrice, collected = the paid part of its installment schedule — the
// same source of truth the /ventes/suivi page uses.
export type SalesCallRow = {
  id: string;
  source: string; // "iclosed" | "calendly" | "native" | "manual"
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  scheduledAt: string; // ISO
  closer: string | null;
  eventType: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  attendance: CallAttendance;
  outcome: CallOutcome;
  saleId: string | null;
  contracted: number | null;
  collected: number | null;
  outcomeSetAt: string | null;
  // Expected answer date (ISO) while outcome is "awaiting_decision", else null.
  decisionDueAt: string | null;
  commentCount: number;
};

export const getSalesCalls = cache(async (accountId: string): Promise<SalesCallRow[]> => {
  const [rows, counts] = await Promise.all([
    db
      .select({ call: salesCalls, sale: sales })
      .from(salesCalls)
      .leftJoin(sales, eq(salesCalls.saleId, sales.id))
      .where(eq(salesCalls.userId, accountId))
      .orderBy(desc(salesCalls.scheduledAt)),
    db
      .select({ callId: salesCallComments.callId, n: sql<number>`count(*)::int` })
      .from(salesCallComments)
      .innerJoin(salesCalls, eq(salesCallComments.callId, salesCalls.id))
      .where(eq(salesCalls.userId, accountId))
      .groupBy(salesCallComments.callId),
  ]);
  const countMap = new Map(counts.map((c) => [c.callId, c.n]));

  return rows.map(({ call, sale }) => ({
    id: call.id,
    source: call.source,
    inviteeName: call.inviteeName,
    inviteeEmail: call.inviteeEmail,
    inviteePhone: call.inviteePhone,
    scheduledAt: call.scheduledAt.toISOString(),
    closer: call.closer,
    eventType: call.eventType,
    utmSource: call.utmSource,
    utmMedium: call.utmMedium,
    utmCampaign: call.utmCampaign,
    utmContent: call.utmContent,
    utmTerm: call.utmTerm,
    attendance: call.attendance,
    outcome: call.outcome,
    saleId: call.saleId,
    contracted: sale ? sale.totalPrice : null,
    collected: sale ? summarize(sale.totalPrice, sale.installments).paidTotal : null,
    outcomeSetAt: call.outcomeSetAt ? call.outcomeSetAt.toISOString() : null,
    decisionDueAt: call.decisionDueAt ? call.decisionDueAt.toISOString() : null,
    commentCount: countMap.get(call.id) ?? 0,
  }));
});
