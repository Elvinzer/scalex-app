"use server";

import { and, eq, gte, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { adCampaigns, closingKpiEntries, dataImports, monthlyMetrics, sales, settingKpiEntries } from "@/db/schema";
import { createContentPost } from "@/lib/content-posts/queries";
import { monthDateRange } from "@/lib/date-range";
import { commitImportPayloadSchema, type CommitImportPayload } from "@/lib/import/schema";
import { CLOSING_FIELDS, resolveDailySourceOverlay, SETTING_FIELDS } from "@/lib/monthly-metrics/resolve";
import { EMPTY_MONTHLY_METRICS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import { writeMonthlyMetrics } from "@/lib/monthly-metrics/write";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

export type BlockedField = { field: string; reason: string };

export type CommitImportResult =
  | { status: "duplicate_warning"; previousImport: { targetYear: number | null; targetMonth: number | null; createdAt: Date } }
  | { status: "committed"; fieldsWritten: number; monthsCount: number; blockedFields: BlockedField[] }
  | { status: "error"; error: string };

const PROTECTED_FIELDS = new Set<string>([...SETTING_FIELDS, ...CLOSING_FIELDS]);
const DAILY_ROLLUP_REASON = "Ce chiffre vient de ton suivi quotidien, il est déjà à jour.";
const STRIPE_SOURCED_REASON = "Ce chiffre vient de Stripe, il est déjà à jour.";

async function resolveAuth(): Promise<{ accountId: string } | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  const access = await requirePermission(data.claims.sub as string, "datas");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  return { accountId: access.accountId };
}

// Which fields of this month are currently read-only because they're
// sourced from daily setting/closing entries — same detection
// datas/month-modal.tsx already uses, reused here so an import can never
// silently overwrite a daily roll-up (brief §C: "import bloqué avec
// explication").
async function protectedFieldsForMonth(accountId: string, year: number, month: number): Promise<Set<string>> {
  const range = monthDateRange(year, month);
  const [dailySetting, dailyClosing] = await Promise.all([
    db
      .select()
      .from(settingKpiEntries)
      .where(and(eq(settingKpiEntries.userId, accountId), gte(settingKpiEntries.date, range.from), lte(settingKpiEntries.date, range.to))),
    db
      .select()
      .from(closingKpiEntries)
      .where(and(eq(closingKpiEntries.userId, accountId), gte(closingKpiEntries.date, range.from), lte(closingKpiEntries.date, range.to))),
  ]);

  const overlay = resolveDailySourceOverlay(range, dailySetting, dailyClosing);
  const protectedFields = new Set<string>();
  if (overlay.settingSourced) for (const field of SETTING_FIELDS) protectedFields.add(field);
  if (overlay.closingSourced) for (const field of CLOSING_FIELDS) protectedFields.add(field);
  return protectedFields;
}

async function commitMonthlyMetricsMonth(
  accountId: string,
  month: CommitImportPayload["months"][number]
): Promise<{ fieldsWritten: number; blocked: BlockedField[] }> {
  const [protectedFields, [existingRow]] = await Promise.all([
    protectedFieldsForMonth(accountId, month.year, month.month),
    db
      .select()
      .from(monthlyMetrics)
      .where(and(eq(monthlyMetrics.userId, accountId), eq(monthlyMetrics.year, month.year), eq(monthlyMetrics.month, month.month)))
      .limit(1),
  ]);

  const base: MonthlyMetricsInput = existingRow
    ? {
        cashCollected: existingRow.cashCollected,
        cashContracted: existingRow.cashContracted,
        newFollowers: existingRow.newFollowers,
        firstMessages: existingRow.firstMessages,
        conversations: existingRow.conversations,
        callsProposed: existingRow.callsProposed,
        callsBooked: existingRow.callsBooked,
        callsTaken: existingRow.callsTaken,
        salesClosed: existingRow.salesClosed,
      }
    : { ...EMPTY_MONTHLY_METRICS };

  const blocked: BlockedField[] = [];
  let fieldsWritten = 0;

  for (const [field, rawValue] of Object.entries(month.values)) {
    if (!(field in base)) continue; // not a monthly_metrics field — ignore rather than crash
    if (PROTECTED_FIELDS.has(field) && protectedFields.has(field)) {
      blocked.push({ field, reason: DAILY_ROLLUP_REASON });
      continue;
    }
    // cashCollected is the one monthly_metrics field the Stripe sync can own
    // (lib/stripe/sync-write.ts) — "stale" (Stripe disconnected) is NOT
    // protected, since manual entry reopens once Stripe is gone.
    if (field === "cashCollected" && existingRow?.cashCollectedSource === "stripe") {
      blocked.push({ field, reason: STRIPE_SOURCED_REASON });
      continue;
    }
    const choice = month.conflictChoices?.[field];
    if (choice === "keep") continue;
    const key = field as keyof MonthlyMetricsInput;
    base[key] = typeof rawValue === "number" ? rawValue : Number(rawValue);
    fieldsWritten += 1;
  }

  await writeMonthlyMetrics(accountId, month.year, month.month, base);
  return { fieldsWritten, blocked };
}

export async function commitImport(payload: unknown): Promise<CommitImportResult> {
  const auth = await resolveAuth();
  if ("error" in auth) return { status: "error", error: auth.error };
  const { accountId } = auth;

  const parsed = commitImportPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { status: "error", error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const data = parsed.data;

  if (!data.confirmDuplicate) {
    const [previous] = await db
      .select()
      .from(dataImports)
      .where(and(eq(dataImports.userId, accountId), eq(dataImports.fileHash, data.fileHash), eq(dataImports.status, "committed")))
      .limit(1);
    if (previous) {
      return {
        status: "duplicate_warning",
        previousImport: { targetYear: previous.targetYear, targetMonth: previous.targetMonth, createdAt: previous.createdAt },
      };
    }
  }

  let fieldsWritten = 0;
  const blockedFieldsByName = new Map<string, BlockedField>();

  if (data.targetTable === "monthly_metrics") {
    for (const month of data.months) {
      const result = await commitMonthlyMetricsMonth(accountId, month);
      fieldsWritten += result.fieldsWritten;
      for (const blocked of result.blocked) blockedFieldsByName.set(blocked.field, blocked);
    }
  } else if (data.targetTable === "content_posts") {
    // Append-only list — an imported "liste de posts" always creates new
    // rows, never updates existing ones (no natural dedup key on this table).
    for (const month of data.months) {
      const v = month.values;
      await createContentPost(accountId, {
        platform: String(v.platform ?? ""),
        type: (v.type as "post" | "reel" | "story" | "video" | "live" | undefined) ?? "post",
        title: String(v.title ?? ""),
        publishedAt: String(v.publishedAt ?? `${month.year}-${String(month.month).padStart(2, "0")}-01`),
        url: v.url ? String(v.url) : null,
        views: typeof v.views === "number" ? v.views : Number(v.views ?? 0),
        likes: v.likes !== undefined ? Number(v.likes) : null,
        comments: v.comments !== undefined ? Number(v.comments) : null,
        shares: v.shares !== undefined ? Number(v.shares) : null,
        clicks: v.clicks !== undefined ? Number(v.clicks) : null,
        leads: v.leads !== undefined ? Number(v.leads) : null,
      });
      fieldsWritten += Object.keys(v).length;
    }
  } else if (data.targetTable === "sales") {
    // Append-only list — same reasoning as content_posts above.
    for (const month of data.months) {
      const v = month.values;
      await db.insert(sales).values({
        userId: accountId,
        clientName: String(v.clientName ?? "Client importé"),
        clientEmail: v.clientEmail ? String(v.clientEmail) : null,
        sourceChannel: v.sourceChannel ? String(v.sourceChannel) : null,
        totalPrice: typeof v.totalPrice === "number" ? v.totalPrice : Number(v.totalPrice ?? 0),
        paymentType: (v.paymentType as "one_shot" | "installments" | undefined) ?? "one_shot",
        saleDate: String(v.saleDate ?? `${month.year}-${String(month.month).padStart(2, "0")}-01`),
        closer: v.closer ? String(v.closer) : null,
      });
      fieldsWritten += Object.keys(v).length;
    }
  } else if (data.targetTable === "ad_campaigns") {
    // Each entry here represents ONE CAMPAIGN (not a calendar month) —
    // the client groups rows by campaign name and computes startDate/
    // endDate as the min/max date in the sheet before sending this
    // payload, same "repurpose months[] as one-row-per-entity" convention
    // already used by content_posts/sales above. Append-only.
    for (const month of data.months) {
      const v = month.values;
      await db.insert(adCampaigns).values({
        userId: accountId,
        platform: "import",
        name: String(v.campaignName ?? "Campagne importée"),
        budget: null,
        spend: v.spend !== undefined ? Math.round(Number(v.spend)) : null,
        impressions: v.impressions !== undefined ? Math.round(Number(v.impressions)) : null,
        clicks: v.clicks !== undefined ? Math.round(Number(v.clicks)) : null,
        leads: v.leads !== undefined ? Math.round(Number(v.leads)) : null,
        startDate: String(v.startDate ?? `${month.year}-${String(month.month).padStart(2, "0")}-01`),
        endDate: v.endDate ? String(v.endDate) : null,
      });
      fieldsWritten += Object.keys(v).length;
    }
  }

  const first = data.months[0];
  await db.insert(dataImports).values({
    userId: accountId,
    fileHash: data.fileHash,
    targetYear: first?.year ?? null,
    targetMonth: first?.month ?? null,
    status: "committed",
    fieldsCount: fieldsWritten,
    monthsCount: data.months.length,
    hadConflicts: data.months.some((m) => Object.keys(m.conflictChoices ?? {}).length > 0),
    keySource: data.keySource,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
  });

  revalidatePath("/datas");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/overview");

  return { status: "committed", fieldsWritten, monthsCount: data.months.length, blockedFields: [...blockedFieldsByName.values()] };
}
