"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { closingKpiEntries } from "@/db/schema";
import { parseClosingKpiCsv, type ClosingKpiCsvError } from "@/lib/closing/csv";
import {
  closingKpiEntryInputSchema,
  editableClosingKpiFields,
  type EditableClosingKpiField,
} from "@/lib/closing/schema";
import { requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

export async function saveClosingKpiEntry(
  formData: FormData
): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }
  const access = await requirePermission(userId, "ventes:closing");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = closingKpiEntryInputSchema.safeParse({
    date: formData.get("date"),
    callsAttended: Number(formData.get("callsAttended")),
    salesClosed: Number(formData.get("salesClosed")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrée invalide" };
  }

  await db
    .insert(closingKpiEntries)
    .values({ userId: accountId, enteredByUserId: userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [closingKpiEntries.userId, closingKpiEntries.date],
      set: {
        enteredByUserId: userId,
        callsAttended: parsed.data.callsAttended,
        salesClosed: parsed.data.salesClosed,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/ventes/closing");
  revalidatePath("/diagnostic");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function updateClosingKpiEntryField(
  entryId: string,
  field: EditableClosingKpiField,
  value: number
): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }
  const access = await requirePermission(userId, "ventes:closing");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  if (!editableClosingKpiFields.includes(field)) {
    return { error: "Champ invalide" };
  }

  const parsed = closingKpiEntryInputSchema.shape[field].safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valeur invalide" };
  }

  const updated = await db
    .update(closingKpiEntries)
    .set({ [field]: parsed.data, enteredByUserId: userId, updatedAt: new Date() })
    .where(and(eq(closingKpiEntries.id, entryId), eq(closingKpiEntries.userId, accountId)))
    .returning({ id: closingKpiEntries.id });

  if (updated.length === 0) {
    return { error: "Entrée introuvable" };
  }

  revalidatePath("/ventes/closing");
  revalidatePath("/diagnostic");
  return { error: null };
}

export type ImportClosingKpiCsvResult = {
  imported: number;
  errors: ClosingKpiCsvError[];
};

export async function importClosingKpiCsv(rawCsv: string): Promise<ImportClosingKpiCsvResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:closing");
  if (!access) {
    return { imported: 0, errors: [{ line: 0, message: "Tu n'as pas accès à cette section." }] };
  }
  const { accountId } = access;

  // Re-validated server-side even though csv-import.tsx already parsed it —
  // the client-side pass is UX only, never trusted for the actual write.
  const { rows, errors } = parseClosingKpiCsv(rawCsv);
  if (rows.length === 0) {
    return { imported: 0, errors };
  }

  await db
    .insert(closingKpiEntries)
    .values(rows.map((row) => ({ userId: accountId, enteredByUserId: userId, ...row })))
    .onConflictDoUpdate({
      target: [closingKpiEntries.userId, closingKpiEntries.date],
      set: {
        enteredByUserId: sql`excluded.entered_by_user_id`,
        callsAttended: sql`excluded.calls_attended`,
        salesClosed: sql`excluded.sales_closed`,
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/ventes/closing");
  revalidatePath("/diagnostic");
  return { imported: rows.length, errors };
}
