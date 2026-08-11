"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { sales, salesCalls } from "@/db/schema";
import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { buildSaleInput } from "@/lib/iclosed/sale";
import { createSale, deleteSale, updateSale } from "@/lib/sales/queries";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Inline disposition — no modal. `setCallResult` is the one-click outcome
// (no-show / non closé / closé); `setCallAmounts` handles the two inline number
// cells shown only when a call is "closé". Money still lives only on the linked
// sale ("no double entry"): a positive contracted amount creates/updates it, a
// cleared amount removes it.

const resultSchema = z.object({
  callId: z.string().uuid(),
  result: z.enum(["no_show", "not_closed", "closed", "awaiting_decision"]),
});

async function loadCall(accountId: string, callId: string) {
  const [call] = await db
    .select()
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)))
    .limit(1);
  return call ?? null;
}

// For users without iClosed/Calendly connected (or logging an off-platform
// call even when one is) — a plain insert with source: "manual". Only
// creates the booking itself; outcome/amounts go through the exact same
// setCallResult/setCallAmounts flow above as any synced call, so nothing
// downstream needs to know a call didn't come from a webhook.
// iclosedCallId is NOT NULL and the target of a (userId, iclosedCallId)
// unique index — synthesized here since a manual call has no real external
// id to reuse.
const manualCallSchema = z.object({
  inviteeName: z.string().min(1, "Le nom est requis"),
  inviteeEmail: z.string().email().nullable(),
  inviteePhone: z.string().trim().min(7, "Numéro de téléphone invalide").max(40, "Numéro de téléphone invalide").nullable(),
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  closer: z.string().nullable(),
  setterId: z.string().uuid().nullable(),
  attendance: z.enum(["booked", "showed", "no_show", "cancelled"]),
});

export async function createManualCallAction(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = manualCallSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  await db.insert(salesCalls).values({
    userId: accountId,
    iclosedCallId: crypto.randomUUID(),
    source: "manual",
    inviteeName: parsed.data.inviteeName,
    inviteeEmail: parsed.data.inviteeEmail,
    inviteePhone: parsed.data.inviteePhone,
    scheduledAt: new Date(`${parsed.data.scheduledAt}T12:00:00Z`),
    closer: parsed.data.closer,
    setterId: parsed.data.setterId,
    attendance: parsed.data.attendance,
  });

  revalidatePath("/ventes/appels");
  revalidateBusinessData();
  return { error: null };
}

export async function setCallResult(callId: string, result: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = resultSchema.safeParse({ callId, result });
  if (!parsed.success) return { error: "Données invalides" };

  const call = await loadCall(accountId, callId);
  if (!call) return { error: "Appel introuvable." };

  const attendance = parsed.data.result === "no_show" ? "no_show" : "showed";
  const outcome =
    parsed.data.result === "closed"
      ? "closed"
      : parsed.data.result === "not_closed"
        ? "not_closed"
        : parsed.data.result === "awaiting_decision"
          ? "awaiting_decision"
          : "pending";

  // Leaving "closed" drops the linked sale so the CA never keeps a ghost. Amounts
  // for a fresh close are entered right after via the inline cells.
  let saleId = call.saleId;
  if (parsed.data.result !== "closed" && call.saleId) {
    await deleteSale(accountId, call.saleId);
    saleId = null;
  }

  // The expected-answer date only lives while the call is "awaiting_decision";
  // leaving that state clears it (the inline picker sets it right after).
  const decisionDueAt = parsed.data.result === "awaiting_decision" ? call.decisionDueAt : null;

  await db
    .update(salesCalls)
    .set({ attendance, outcome, saleId, decisionDueAt, outcomeSetAt: new Date(), updatedAt: new Date() })
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));

  await track("iclosed_call_outcome_set", userId, { result: parsed.data.result });

  revalidatePath("/ventes/appels");
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  revalidateBusinessData();
  return { error: null };
}

// Expected-answer date for a call parked in "awaiting_decision" — set from the
// inline date field. Stored at midday UTC so the calendar day is stable whatever
// the viewer's timezone. No CA impact, so only /ventes/appels is revalidated.
const decisionDueSchema = z.object({
  callId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
});

export async function setCallDecisionDue(callId: string, dueDate: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = decisionDueSchema.safeParse({ callId, dueDate });
  if (!parsed.success) return { error: "Date invalide" };

  const call = await loadCall(accountId, callId);
  if (!call) return { error: "Appel introuvable." };
  // Only meaningful while awaiting a decision — mirrors the setCallAmounts guard.
  if (call.outcome !== "awaiting_decision") return { error: null };

  await db
    .update(salesCalls)
    .set({ decisionDueAt: new Date(`${parsed.data.dueDate}T12:00:00Z`), updatedAt: new Date() })
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));

  revalidatePath("/ventes/appels");
  revalidateBusinessData();
  return { error: null };
}

const amountsSchema = z.object({
  callId: z.string().uuid(),
  contracted: z.number().int().min(0),
  collected: z.number().int().min(0),
});

export async function setCallAmounts(
  callId: string,
  contracted: unknown,
  collected: unknown
): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = amountsSchema.safeParse({ callId, contracted, collected });
  if (!parsed.success) return { error: "Montant invalide" };

  const call = await loadCall(accountId, callId);
  if (!call) return { error: "Appel introuvable." };
  if (call.outcome !== "closed") return { error: null }; // amounts only apply to a closed call

  if (parsed.data.contracted <= 0) {
    // Amount cleared → remove the linked sale (call stays "closé", 0 € CA).
    if (call.saleId) {
      await deleteSale(accountId, call.saleId);
      await db
        .update(salesCalls)
        .set({ saleId: null, updatedAt: new Date() })
        .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));
    }
  } else {
    const saleInput = buildSaleInput({
      inviteeName: call.inviteeName,
      inviteeEmail: call.inviteeEmail,
      closer: call.closer,
      setterId: call.setterId ?? null,
      contracted: parsed.data.contracted,
      collected: parsed.data.collected,
      saleDate: call.scheduledAt.toISOString().slice(0, 10),
    });
    if (call.saleId) {
      await updateSale(accountId, call.saleId, saleInput);
      if (call.metaTouchpointId) {
        await db
          .update(sales)
          .set({ metaTouchpointId: call.metaTouchpointId })
          .where(and(eq(sales.id, call.saleId), eq(sales.userId, accountId)));
      }
    } else {
      const created = await createSale(accountId, saleInput);
      if (call.metaTouchpointId) {
        await db
          .update(sales)
          .set({ metaTouchpointId: call.metaTouchpointId })
          .where(and(eq(sales.id, created.id), eq(sales.userId, accountId)));
      }
      await db
        .update(salesCalls)
        .set({ saleId: created.id, updatedAt: new Date() })
        .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));
    }
  }

  revalidatePath("/ventes/appels");
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  revalidateBusinessData();
  return { error: null };
}
