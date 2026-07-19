"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { saveBusinessSection } from "@/app/(app)/business/actions";
import { saveMonthlyMetrics } from "@/app/(app)/datas/actions";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import type { Offer, SaleMode } from "@/lib/business/types";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeOnboardingGoulot, type OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  return data.claims.sub as string;
}

// The single "previous full calendar month" window screen 2 collects data
// for and screen 3 diagnoses — lastCompletedMonths(1) already builds
// exactly this, no need for separate date math.
export async function getOnboardingMonthWindow() {
  return lastCompletedMonths(1)[0];
}

export async function saveOnboardingOffer(data: {
  niche: string;
  offerName: string;
  price: number;
  saleMode: SaleMode;
}): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const profile = await getBusinessProfile(userId);

  const identityResult = await saveBusinessSection("identity", { ...profile.identity, niche: data.niche });
  if (identityResult.error) return identityResult;

  // Demotes any pre-existing "main" offer — unlikely this early (onboarding
  // runs before Mon business is ever touched) but keeps the invariant
  // honest regardless of when this runs.
  const newOffer: Offer = {
    id: crypto.randomUUID(),
    name: data.offerName,
    price: data.price,
    type: null,
    saleMode: data.saleMode,
    recurrence: null,
    isMain: true,
  };
  const offers = [...profile.sales.offers.map((offer) => ({ ...offer, isMain: false })), newOffer];
  const salesResult = await saveBusinessSection("sales", { ...profile.sales, offers });
  if (salesResult.error) return salesResult;

  await track("onboarding_step_completed", userId, { step: 2 });
  return { error: null };
}

export async function saveOnboardingMonth(
  year: number,
  month: number,
  data: unknown
): Promise<{ error: string | null; result?: OnboardingGoulotResult }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const monthResult = await saveMonthlyMetrics(year, month, data);
  if (monthResult.error) return monthResult;

  await track("onboarding_step_completed", userId, { step: 3 });

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const businessProfile = await getBusinessProfile(userId);
  const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(userId),
  ]);

  const monthWindow = lastCompletedMonths(1)[0];
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months: [monthWindow],
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });

  const benchmarks = await getDiagnosticBenchmarks(userRow?.sector ?? null);
  const result = computeOnboardingGoulot({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });

  if (result.kind === "point" && userRow) {
    const minutesSinceSignup = Math.round((Date.now() - userRow.createdAt.getTime()) / 60_000);
    await track("activation_reached", userId, { minutes_since_signup: minutesSinceSignup, metric_key: result.point.key });
  }

  await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");

  return { error: null, result };
}

export async function skipOnboarding(): Promise<void> {
  const userId = await requireUserId();
  if (typeof userId === "string") {
    await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
  }
  redirect("/dashboard");
}
