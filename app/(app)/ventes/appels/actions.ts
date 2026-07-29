"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { salesCalls } from "@/db/schema";
import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { createSale, deleteSale, updateSale } from "@/lib/sales/queries";
import type { SaleInput } from "@/lib/sales/schema";
import { saleInputSchema } from "@/lib/sales/schema";
import type { SaleInstallment } from "@/lib/sales/types";
import { requirePermission } from "@/lib/team/context";

// Marking a call's outcome is the ONE manual step (V1): the closer says whether
// they showed / closed / didn't. When "closed", we create (or refresh) a linked
// sales row so the amount flows into the existing /ventes/suivi CA — money lives
// only there, never duplicated on the call ("no double entry" rule).

const outcomeSchema = z
  .object({
    callId: z.string().uuid(),
    result: z.enum(["no_show", "not_closed", "closed"]),
    contracted: z.number().int().min(0).optional(),
    collected: z.number().int().min(0).optional(),
    saleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.result !== "closed" || typeof d.contracted === "number", {
    message: "Le montant contracté est requis pour un appel closé.",
    path: ["contracted"],
  })
  .refine((d) => d.result !== "closed" || (d.collected ?? 0) <= (d.contracted ?? 0), {
    message: "Le montant collecté ne peut pas dépasser le contracté.",
    path: ["collected"],
  });

// Represents "collected out of contracted" through the existing installment
// model: fully paid -> one-shot; partial -> a paid slice + an upcoming
// remainder (summarize() then reports paidTotal = collected).
function buildPayment(
  contracted: number,
  collected: number,
  dateStr: string
): { paymentType: SaleInput["paymentType"]; installments: SaleInstallment[] | null } {
  if (collected >= contracted) {
    return { paymentType: "one_shot", installments: null };
  }
  const installments: SaleInstallment[] = [
    { amount: collected, dueDate: dateStr, status: "paid", paidAt: dateStr },
    { amount: contracted - collected, dueDate: dateStr, status: "upcoming", paidAt: null },
  ];
  return { paymentType: "installments", installments };
}

export async function setCallOutcome(input: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const { callId, result, contracted, collected, saleDate } = parsed.data;

  const [call] = await db
    .select()
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)))
    .limit(1);
  if (!call) return { error: "Appel introuvable." };

  const attendance = result === "no_show" ? "no_show" : "showed";
  const outcome = result === "closed" ? "closed" : result === "not_closed" ? "not_closed" : "pending";

  // Handle the linked sale. Only a "closed" call has one; switching away from
  // closed removes the previously-created sale so the CA never keeps a ghost.
  let saleId: string | null = call.saleId;

  if (result === "closed") {
    const dateStr = saleDate ?? new Date().toISOString().slice(0, 10);
    const { paymentType, installments } = buildPayment(contracted ?? 0, collected ?? 0, dateStr);

    const saleInput = saleInputSchema.parse({
      clientName: call.inviteeName?.trim() || "Client iClosed",
      clientEmail: call.inviteeEmail ?? null,
      sourceChannel: "iclosed",
      offerId: null,
      totalPrice: contracted ?? 0,
      paymentType,
      installments,
      saleDate: dateStr,
      closer: call.closer ?? null,
      hasUpsell: false,
      upsellOfferId: null,
      upsellAmount: null,
      setterId: call.setterId ?? null,
      leadId: null,
    } satisfies SaleInput);

    if (call.saleId) {
      // Re-editing a close: update the existing linked sale in place.
      await updateSale(accountId, call.saleId, saleInput);
      saleId = call.saleId;
    } else {
      const created = await createSale(accountId, saleInput);
      saleId = created.id;
    }
  } else if (call.saleId) {
    // Was closed, now isn't — drop the linked sale and unlink.
    await deleteSale(accountId, call.saleId);
    saleId = null;
  }

  await db
    .update(salesCalls)
    .set({ attendance, outcome, saleId, outcomeSetAt: new Date(), updatedAt: new Date() })
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)));

  await track("iclosed_call_outcome_set", userId, { result });

  revalidatePath("/ventes/appels");
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  return { error: null };
}
