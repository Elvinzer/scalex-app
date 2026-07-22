"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
import { monthlyMetricsInputSchema } from "@/lib/monthly-metrics/schema";
import { writeMonthlyMetrics } from "@/lib/monthly-metrics/write";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

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
  const access = await requirePermission(userId, "datas");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = monthlyMetricsInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  await writeMonthlyMetrics(accountId, year, month, parsed.data);

  // Single shared action — covers Datas, the onboarding wizard's screen 2,
  // and the weekly check-in modal automatically, so this fires exactly
  // once per real call site rather than being duplicated in each.
  await track("month_data_filled", userId, { month: `${year}-${String(month).padStart(2, "0")}` });

  revalidatePath("/datas");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/acquisition/setting");
  revalidatePath("/ventes/closing");
  return { error: null };
}
