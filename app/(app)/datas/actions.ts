"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { monthlyMetrics } from "@/db/schema";
import { monthlyMetricsInputSchema } from "@/lib/monthly-metrics/schema";
import { createClient } from "@/lib/supabase/server";

export async function saveMonthlyMetrics(
  year: number,
  month: number,
  data: unknown
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;

  const parsed = monthlyMetricsInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  await db
    .insert(monthlyMetrics)
    .values({ userId, year, month, ...parsed.data })
    .onConflictDoUpdate({
      target: [monthlyMetrics.userId, monthlyMetrics.year, monthlyMetrics.month],
      set: { ...parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/datas");
  revalidatePath("/dashboard");
  revalidatePath("/funnel");
  revalidatePath("/funnel/setting");
  revalidatePath("/funnel/closing");
  return { error: null };
}
