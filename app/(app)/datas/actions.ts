"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { track } from "@/lib/analytics";
import { db } from "@/db";
import { dataImports, sales } from "@/db/schema";
import { getUserById } from "@/lib/current-user";
import { monthDateRange } from "@/lib/date-range";
import { aggregateSalesCallsByMonth, monthKey } from "@/lib/monthly-metrics/call-source";
import { monthlyMetricsInputSchema } from "@/lib/monthly-metrics/schema";
import { getSalesCallKpiRecords } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay, stripDailySourcedFields } from "@/lib/monthly-metrics/resolve";
import { writeMonthlyMetrics } from "@/lib/monthly-metrics/write";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

const monthlyImportUsageSchema = z.object({
  fileHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).min(1).max(5),
  keySource: z.enum(["byok", "shared"]),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  fieldsCount: z.number().int().min(0),
});

const monthlySourceOverridesSchema = z.object({
  settingManualOverride: z.boolean(),
  closingManualOverride: z.boolean(),
});

export async function saveMonthlyMetrics(
  year: number,
  month: number,
  data: unknown,
  importUsage?: unknown,
  sourceOverrides?: unknown
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
  const parsedImportUsage = importUsage === undefined ? null : monthlyImportUsageSchema.safeParse(importUsage);
  if (parsedImportUsage && !parsedImportUsage.success) {
    return { error: "Les informations de l'import Falco sont invalides. Relance l'analyse avant d'enregistrer." };
  }
  const parsedSourceOverrides = sourceOverrides === undefined ? null : monthlySourceOverridesSchema.safeParse(sourceOverrides);
  if (parsedSourceOverrides && !parsedSourceOverrides.success) {
    return { error: "Le mode de pilotage des KPI est invalide. Recharge la fenêtre puis réessaie." };
  }

  const overrides = parsedSourceOverrides?.success ? parsedSourceOverrides.data : undefined;
  const [monthlyCallSource, salesRows] = await Promise.all([
    getSalesCallKpiRecords(accountId),
    db.select({ saleDate: sales.saleDate, isOrphan: sales.isOrphan, parentSaleId: sales.parentSaleId }).from(sales).where(eq(sales.userId, accountId)),
  ]);
  const range = monthDateRange(year, month);
  const callSource = aggregateSalesCallsByMonth(monthlyCallSource)[monthKey(year, month)] ?? null;
  const salesClosedRows = salesRows.filter((row) => !row.isOrphan && row.parentSaleId === null && row.saleDate >= range.from && row.saleDate <= range.to);
  const currentUser = await getUserById(accountId);
  const saveOverlay = resolveDailySourceOverlay(range, [], [], overrides ?? {}, callSource, {
    callTrackingConnected: Boolean(currentUser?.iclosedConnected || currentUser?.calendlyConnected),
    salesClosed: salesClosedRows.length > 0 ? salesClosedRows.length : undefined,
  });
  await writeMonthlyMetrics(accountId, year, month, stripDailySourcedFields(parsed.data, saveOverlay), overrides);

  if (parsedImportUsage?.success) {
    await Promise.all(
      parsedImportUsage.data.fileHashes.map((fileHash) =>
        db.insert(dataImports).values({
          userId: accountId,
          fileHash,
          targetYear: year,
          targetMonth: month,
          status: "committed",
          fieldsCount: parsedImportUsage.data.fieldsCount,
          monthsCount: 1,
          hadConflicts: false,
          keySource: parsedImportUsage.data.keySource,
          inputTokens: parsedImportUsage.data.inputTokens,
          outputTokens: parsedImportUsage.data.outputTokens,
        })
      )
    );
  }

  // Single shared action — covers Datas, the onboarding wizard's screen 2,
  // and the weekly check-in modal automatically, so this fires exactly
  // once per real call site rather than being duplicated in each.
  await track("month_data_filled", userId, { month: `${year}-${String(month).padStart(2, "0")}` });

  revalidatePath("/datas");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic-app");
  revalidatePath("/ventes/pipeline");
  revalidatePath("/ventes/pipeline/funnel");
  revalidateBusinessData(access.accountId);
  return { error: null };
}
