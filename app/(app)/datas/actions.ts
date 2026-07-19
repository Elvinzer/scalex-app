"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
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

  // Single shared action — covers Datas, the onboarding wizard's screen 2,
  // and the weekly check-in modal automatically, so this fires exactly
  // once per real call site rather than being duplicated in each.
  await track("month_data_filled", userId, { month: `${year}-${String(month).padStart(2, "0")}` });

  revalidatePath("/datas");
  revalidatePath("/dashboard");
  revalidatePath("/funnel");
  revalidatePath("/acquisition/setting");
  revalidatePath("/ventes/closing");
  return { error: null };
}
