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
import { lastCompletedMonths, monthWindowFor } from "@/lib/diagnostic/completed-months";
import { computeOnboardingGoulot, type OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";

// The manual-entry form (screen 2's "Saisir à la main" path) still asks for
// one specific month — lastCompletedMonths(1) is that window. The import
// path no longer targets any single month (see finalizeOnboarding below):
// the user can hand over as many months as their file has, and the goulot
// engine sorts out what to do with them.
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

// Shared tail end of onboarding screen 2, regardless of HOW the data got
// there (manual entry writes exactly one month; a smart import can write
// several at once — see completeOnboardingAfterImport below). Deliberately
// diagnoses over every month that now has a monthly_metrics row, not a
// fixed "last completed month" window: onboarding is a one-time event on a
// brand new account, so whatever data exists at this point IS what the
// user just gave us, and computeOnboardingGoulot doesn't care how many
// months it's fed.
async function finalizeOnboarding(userId: string): Promise<{ result: OnboardingGoulotResult }> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const businessProfile = await getBusinessProfile(userId);
  const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(userId),
  ]);

  const months = allMonthlyRows.map((row) => monthWindowFor(row.year, row.month));
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
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

  return { result };
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
  const { result } = await finalizeOnboarding(userId);
  return { error: null, result };
}

// Called once a smart import has already committed however many months it
// found (commitImport, via ImportFlow's normal onCommitted hook — no
// special single-month extraction path anymore, see components/import/
// import-flow.tsx) — this only computes the diagnosis and closes out
// onboarding, it never writes monthly_metrics itself.
export async function completeOnboardingAfterImport(): Promise<{ error: string | null; result?: OnboardingGoulotResult }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await track("onboarding_step_completed", userId, { step: 3 });
  const { result } = await finalizeOnboarding(userId);
  return { error: null, result };
}

export async function skipOnboarding(): Promise<void> {
  const userId = await requireUserId();
  if (typeof userId === "string") {
    await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
  }
  redirect("/dashboard");
}
