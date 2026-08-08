import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { salesCalls } from "@/db/schema";
import { createSale } from "@/lib/sales/queries";

import { listCalls, listDeals } from "./client";
import { buildSaleInput } from "./sale";

// Core iClosed → Scale X sync, shared by the Inngest job (on connect) and the
// on-demand "Rafraîchir" action. iClosed exposes no webhook-management API, so
// this pull is how call data enters the app; it's idempotent (onConflictDoNothing
// on the (userId, iclosedCallId) unique index) so it's safe to run repeatedly.
// Returns the number of newly-inserted calls.
export async function backfillIclosedCalls(userId: string, apiKey: string): Promise<number> {
  // Deal amounts live in a separate resource, keyed by eventCallId.
  const [calls, dealsByCall] = await Promise.all([listCalls(apiKey), listDeals(apiKey)]);
  if (calls.length === 0) return 0;

  // Insert call rows with iClosed's own disposition auto-mapped. Returning tells
  // us which rows are NEW, so a re-run never re-creates a sale or clobbers a
  // hand-set disposition.
  const insertedRows = await db
    .insert(salesCalls)
    .values(
      calls.map((c) => ({
        userId,
        iclosedCallId: c.iclosedCallId,
        inviteeName: c.inviteeName,
        inviteeEmail: c.inviteeEmail,
        inviteePhone: c.inviteePhone,
        scheduledAt: c.scheduledAt,
        durationMinutes: c.durationMinutes,
        closer: c.closer,
        eventType: c.eventType,
        attendance: c.attendance ?? "booked",
        outcome: c.outcome ?? "pending",
        outcomeSetAt: c.attendance ? new Date() : null,
      }))
    )
    .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] })
    .returning({ id: salesCalls.id, iclosedCallId: salesCalls.iclosedCallId });

  // The original import intentionally ignores conflicts so it never overwrites
  // a hand-set outcome or linked sale. Phone data is contact enrichment, so it
  // is safe to refresh on existing rows as well (including rows imported before
  // phone support was wired in).
  for (const c of calls) {
    if (!c.inviteePhone) continue;
    await db
      .update(salesCalls)
      .set({ inviteePhone: c.inviteePhone, updatedAt: new Date() })
      .where(and(eq(salesCalls.userId, userId), eq(salesCalls.iclosedCallId, c.iclosedCallId)));

    // Keep same-account calls from another scheduler connected to the same
    // contact enriched when that scheduler did not collect a phone itself.
    if (c.inviteeEmail) {
      await db
        .update(salesCalls)
        .set({ inviteePhone: c.inviteePhone, updatedAt: new Date() })
        .where(
          and(
            eq(salesCalls.userId, userId),
            isNull(salesCalls.inviteePhone),
            sql`lower(${salesCalls.inviteeEmail}) = lower(${c.inviteeEmail})`
          )
        );
    }
  }

  // For newly-inserted WON calls with a recorded deal amount, create the linked
  // sale so the amount flows into the existing CA (money lives only on the sale).
  const byExternalId = new Map(calls.map((c) => [c.iclosedCallId, c]));
  for (const row of insertedRows) {
    const c = byExternalId.get(row.iclosedCallId);
    if (!c || c.outcome !== "closed") continue;
    const contracted = dealsByCall.get(c.iclosedCallId) ?? c.contracted ?? null;
    // A WON call with no recorded deal amount stays "closed" for the funnel but
    // creates no sale (a 0 € sale would just pollute the CA).
    if (contracted == null || contracted <= 0) continue;
    const saleDate = c.scheduledAt.toISOString().slice(0, 10);
    const sale = await createSale(
      userId,
      buildSaleInput({
        inviteeName: c.inviteeName,
        inviteeEmail: c.inviteeEmail,
        closer: c.closer,
        setterId: null,
        contracted,
        // iClosed exposes no reliable collected figure — treat a WON deal as
        // collected; the closer adjusts per call for payment plans.
        collected: contracted,
        saleDate,
      })
    );
    await db.update(salesCalls).set({ saleId: sale.id }).where(eq(salesCalls.id, row.id));
  }

  return insertedRows.length;
}
