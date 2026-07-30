"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { salesCalls } from "@/db/schema";
import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { buildSaleInput } from "@/lib/iclosed/sale";
import { createSale, deleteSale, updateSale } from "@/lib/sales/queries";
import { requirePermission } from "@/lib/team/context";

// Inline disposition — no modal. `setCallResult` is the one-click outcome
// (no-show / non closé / closé); `setCallAmounts` handles the two inline number
// cells shown only when a call is "closé". Money still lives only on the linked
// sale ("no double entry"): a positive contracted amount creates/updates it, a
// cleared amount removes it.

const resultSchema = z.object({
  callId: z.string().uuid(),
  result: z.enum(["no_show", "not_closed", "closed"]),
});

async function loadCall(accountId: string, callId: string) {
  const [call] = await db
    .select()
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)))
    .limit(1);
  return call ?? null;
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
    parsed.data.result === "closed" ? "closed" : parsed.data.result === "not_closed" ? "not_closed" : "pending";

  // Leaving "closed" drops the linked sale so the CA never keeps a ghost. Amounts
  // for a fresh close are entered right after via the inline cells.
  let saleId = call.saleId;
  if (parsed.data.result !== "closed" && call.saleId) {
    await deleteSale(accountId, call.saleId);
    saleId = null;
  }

  await db
    .update(salesCalls)
    .set({ attendance, outcome, saleId, outcomeSetAt: new Date(), updatedAt: new Date() })
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));

  await track("iclosed_call_outcome_set", userId, { result: parsed.data.result });

  revalidatePath("/ventes/appels");
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
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
    } else {
      const created = await createSale(accountId, saleInput);
      await db
        .update(salesCalls)
        .set({ saleId: created.id, updatedAt: new Date() })
        .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));
    }
  }

  revalidatePath("/ventes/appels");
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  return { error: null };
}
