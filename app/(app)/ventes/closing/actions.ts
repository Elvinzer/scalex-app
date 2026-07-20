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

export async function saveClosingKpiEntry(
  formData: FormData
): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }

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
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [closingKpiEntries.userId, closingKpiEntries.date],
      set: {
        callsAttended: parsed.data.callsAttended,
        salesClosed: parsed.data.salesClosed,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/ventes/closing");
  revalidatePath("/funnel");
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

  if (!editableClosingKpiFields.includes(field)) {
    return { error: "Champ invalide" };
  }

  const parsed = closingKpiEntryInputSchema.shape[field].safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valeur invalide" };
  }

  const updated = await db
    .update(closingKpiEntries)
    .set({ [field]: parsed.data, updatedAt: new Date() })
    .where(and(eq(closingKpiEntries.id, entryId), eq(closingKpiEntries.userId, userId)))
    .returning({ id: closingKpiEntries.id });

  if (updated.length === 0) {
    return { error: "Entrée introuvable" };
  }

  revalidatePath("/ventes/closing");
  revalidatePath("/funnel");
  return { error: null };
}

export type ImportClosingKpiCsvResult = {
  imported: number;
  errors: ClosingKpiCsvError[];
};

export async function importClosingKpiCsv(rawCsv: string): Promise<ImportClosingKpiCsvResult> {
  const userId = await requireUserId();

  // Re-validated server-side even though csv-import.tsx already parsed it —
  // the client-side pass is UX only, never trusted for the actual write.
  const { rows, errors } = parseClosingKpiCsv(rawCsv);
  if (rows.length === 0) {
    return { imported: 0, errors };
  }

  await db
    .insert(closingKpiEntries)
    .values(rows.map((row) => ({ userId, ...row })))
    .onConflictDoUpdate({
      target: [closingKpiEntries.userId, closingKpiEntries.date],
      set: {
        callsAttended: sql`excluded.calls_attended`,
        salesClosed: sql`excluded.sales_closed`,
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/ventes/closing");
  revalidatePath("/funnel");
  return { imported: rows.length, errors };
}
