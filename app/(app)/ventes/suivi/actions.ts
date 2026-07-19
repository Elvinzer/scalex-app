"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { sales } from "@/db/schema";
import { saleInputSchema } from "@/lib/sales/schema";
import { createSale, deleteSale, updateSale } from "@/lib/sales/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import type { InstallmentStatus } from "@/lib/sales/types";

export async function saveSale(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const parsed = saleInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateSale(userId, id, parsed.data);
  } else {
    await createSale(userId, parsed.data);
  }

  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  return { error: null };
}

export async function removeSale(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await deleteSale(userId, id);
  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
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

  const [row] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.userId, userId)))
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

  await db.update(sales).set({ installments }).where(and(eq(sales.id, saleId), eq(sales.userId, userId)));

  revalidatePath("/ventes/suivi");
  revalidatePath("/diagnostic");
  return { error: null };
}
