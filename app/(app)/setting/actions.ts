"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { settingKpiEntries } from "@/db/schema";
import { parseSettingKpiCsv, type SettingKpiCsvError } from "@/lib/setting/csv";
import {
  editableSettingKpiFields,
  settingKpiEntryInputSchema,
  type EditableSettingKpiField,
} from "@/lib/setting/schema";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    throw new Error("Session expirée, reconnecte-toi.");
  }
  return data.claims.sub as string;
}

export async function saveSettingKpiEntry(
  formData: FormData
): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }

  const parsed = settingKpiEntryInputSchema.safeParse({
    date: formData.get("date"),
    newSubscribers: Number(formData.get("newSubscribers")),
    firstMessagesSent: Number(formData.get("firstMessagesSent")),
    conversationsStarted: Number(formData.get("conversationsStarted")),
    callsProposed: Number(formData.get("callsProposed")),
    callsBooked: Number(formData.get("callsBooked")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrée invalide" };
  }

  await db
    .insert(settingKpiEntries)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({
      target: [settingKpiEntries.userId, settingKpiEntries.date],
      set: {
        newSubscribers: parsed.data.newSubscribers,
        firstMessagesSent: parsed.data.firstMessagesSent,
        conversationsStarted: parsed.data.conversationsStarted,
        callsProposed: parsed.data.callsProposed,
        callsBooked: parsed.data.callsBooked,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/setting");
  return { error: null };
}

export async function updateSettingKpiEntryField(
  entryId: string,
  field: EditableSettingKpiField,
  value: number
): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }

  if (!editableSettingKpiFields.includes(field)) {
    return { error: "Champ invalide" };
  }

  const parsed = settingKpiEntryInputSchema.shape[field].safeParse(value);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Valeur invalide" };
  }

  const updated = await db
    .update(settingKpiEntries)
    .set({ [field]: parsed.data, updatedAt: new Date() })
    .where(and(eq(settingKpiEntries.id, entryId), eq(settingKpiEntries.userId, userId)))
    .returning({ id: settingKpiEntries.id });

  if (updated.length === 0) {
    return { error: "Entrée introuvable" };
  }

  revalidatePath("/setting");
  return { error: null };
}

export type ImportSettingKpiCsvResult = {
  imported: number;
  errors: SettingKpiCsvError[];
};

export async function importSettingKpiCsv(rawCsv: string): Promise<ImportSettingKpiCsvResult> {
  const userId = await requireUserId();

  // Re-validated server-side even though csv-import.tsx already parsed it —
  // the client-side pass is UX only, never trusted for the actual write.
  const { rows, errors } = parseSettingKpiCsv(rawCsv);
  if (rows.length === 0) {
    return { imported: 0, errors };
  }

  await db
    .insert(settingKpiEntries)
    .values(rows.map((row) => ({ userId, ...row })))
    .onConflictDoUpdate({
      target: [settingKpiEntries.userId, settingKpiEntries.date],
      set: {
        newSubscribers: sql`excluded.new_subscribers`,
        firstMessagesSent: sql`excluded.first_messages_sent`,
        conversationsStarted: sql`excluded.conversations_started`,
        callsProposed: sql`excluded.calls_proposed`,
        callsBooked: sql`excluded.calls_booked`,
        updatedAt: sql`now()`,
      },
    });

  revalidatePath("/setting");
  return { imported: rows.length, errors };
}
