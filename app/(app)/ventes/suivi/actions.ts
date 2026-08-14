"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { z } from "zod";

import { db } from "@/db";
import { sales } from "@/db/schema";
import { saleInputSchema } from "@/lib/sales/schema";
import { attributeSaleToVideo, removeSaleAttribution } from "@/lib/youtube/attribution";
import { track } from "@/lib/analytics";
import { createSale, deleteSale, updateSale } from "@/lib/sales/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import type { InstallmentStatus } from "@/lib/sales/types";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// The video credited for this sale, declared by the coach at closing time.
// Kept OUT of saleInputSchema on purpose: it isn't a column on `sales`, it's
// a row in video_attributions — one video can be credited for many sales,
// and the credit has its own provenance (declared vs estimated).
const saleAttributionSchema = z.object({ sourceVideoId: z.string().nullable().optional() });
const saleIdSchema = z.string().uuid();

export async function saveSale(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = saleInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  let saleId = id;
  if (id) {
    await updateSale(accountId, id, parsed.data);
  } else {
    const created = await createSale(accountId, parsed.data);
    saleId = created.id;
  }

  // Attribution is written after the sale exists (it FKs to it). Failing
  // here must never lose the sale itself, which is the record that matters —
  // hence the isolated try/catch rather than one transaction.
  const attribution = saleAttributionSchema.safeParse(data);
  if (attribution.success && saleId) {
    const videoId = attribution.data.sourceVideoId ?? null;
    try {
      if (videoId) {
        await attributeSaleToVideo(accountId, saleId, videoId, "declared");
        await track("video_attribution_declared", userId, { method: "declared" });
      } else {
        // Clearing the field un-credits the video rather than silently
        // keeping a stale attribution.
        await removeSaleAttribution(accountId, saleId);
      }
    } catch (error) {
      console.error("[ventes] video attribution failed, sale itself saved", error);
    }
  }

  revalidatePath("/ventes/suivi");
  revalidatePath("/acquisition/contenu/youtube");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData(accountId);
  return { error: null };
}

// Converts a Stripe-created placeholder deal into a normal tracked sale. The
// row is updated in place so its installments keep the original charge id;
// creating a second row here would double-count the payment on the next sync.
export async function createSaleFromOrphan(saleId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsedSaleId = saleIdSchema.safeParse(saleId);
  if (!parsedSaleId.success) return { error: "Vente introuvable" };

  const parsed = saleInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const [row] = await db
    .select({ id: sales.id, isOrphan: sales.isOrphan })
    .from(sales)
    .where(and(eq(sales.id, parsedSaleId.data), eq(sales.userId, access.accountId)))
    .limit(1);

  if (!row || !row.isOrphan) return { error: "Ce paiement n'est plus à rattacher." };

  await db
    .update(sales)
    .set({ ...parsed.data, isOrphan: false })
    .where(and(eq(sales.id, parsedSaleId.data), eq(sales.userId, access.accountId)));

  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

export async function removeSale(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await deleteSale(access.accountId, id);
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

// Toggles a single installment's status (paid/failed) from the detail drawer
// — reads the row, patches just that one entry, writes it back. Only these
// two terminal statuses are settable by hand; "upcoming" is the default a
// generated schedule starts in.
export async function setInstallmentStatus(
  saleId: string,
  installmentIndex: number,
  status: Extract<InstallmentStatus, "paid" | "failed">
): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const [row] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.userId, accountId)))
    .limit(1);

  if (!row || !row.installments || !row.installments[installmentIndex]) {
    return { error: "Échéance introuvable" };
  }

  const installments = [...row.installments];
  installments[installmentIndex] = {
    ...installments[installmentIndex],
    status,
    paidAt: status === "paid" ? new Date().toISOString().slice(0, 10) : installments[installmentIndex].paidAt,
  };

  await db.update(sales).set({ installments }).where(and(eq(sales.id, saleId), eq(sales.userId, accountId)));

  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData(accountId);
  return { error: null };
}

// "Marquer comme traité" on a failed installment — an acknowledgement that
// the owner has followed up with the client directly (Minaly never writes
// to the client's connected Stripe account, see lib/stripe/read-only-client.ts).
// Does NOT change the installment's status: it stays "failed" until a real
// payment (webhook/resync) or a manual override says otherwise.
export async function acknowledgeFailedInstallment(saleId: string, installmentIndex: number): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const [row] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.userId, accountId)))
    .limit(1);

  if (!row || !row.installments || !row.installments[installmentIndex]) {
    return { error: "Échéance introuvable" };
  }

  const installments = [...row.installments];
  installments[installmentIndex] = {
    ...installments[installmentIndex],
    acknowledgedAt: new Date().toISOString(),
  };

  await db.update(sales).set({ installments }).where(and(eq(sales.id, saleId), eq(sales.userId, accountId)));

  revalidatePath("/ventes/suivi");
  revalidateBusinessData(accountId);
  return { error: null };
}
