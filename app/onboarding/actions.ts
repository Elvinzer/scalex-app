"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { saveBusinessSection } from "@/app/(app)/business/actions";
import { saveMonthlyMetrics } from "@/app/(app)/datas/actions";
import { db } from "@/db";
import { users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import type { Offer, SaleMode } from "@/lib/business/types";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths, monthWindowFor } from "@/lib/diagnostic/completed-months";
import { computeOnboardingGoulot, type OnboardingGoulotResult } from "@/lib/diagnostic/onboarding-goulot";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { isAcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { activeLegacyMetricKeysFromBlocks, normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";

const onboardingBlocksSchema = z.object({
  blocks: z.array(z.object({ blockKey: z.string().min(1).max(100), order: z.number().int().min(1).max(20) })).min(2).max(11),
  sources: z.array(z.enum(["organique", "ads", "newsletter", "bouche_a_oreille", "communaute_externe"])).min(1).max(5),
});

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

export async function saveOnboardingFunnels(data: { funnels: string[]; primaryFunnel: string }): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const funnels = Array.from(new Set(data.funnels.filter(isAcquisitionFunnelKey)));
  const primaryFunnel = isAcquisitionFunnelKey(data.primaryFunnel) && funnels.includes(data.primaryFunnel) ? data.primaryFunnel : funnels[0] ?? "lead_magnet";
  const profile = await getBusinessProfile(userId);
  const catalog = await getAcquisitionFunnelCatalog();
  const allowed = new Set(catalog.map((entry) => entry.funnelKey));
  const validFunnels = funnels.filter((funnel) => allowed.has(funnel));
  const selected = validFunnels.length > 0 ? validFunnels : ["lead_magnet"];
  const validPrimary = selected.includes(primaryFunnel) ? primaryFunnel : selected[0];
  const result = await saveBusinessSection("acquisition", {
    ...profile.acquisition,
    funnels: selected,
    primaryFunnel: validPrimary,
    funnelSelectionInferred: false,
  }, "onboarding");
  if (result.error) return result;
  await track("acquisition_funnel_selected", userId, { funnels: selected, primary: validPrimary, from: "onboarding" });
  return { error: null };
}

export async function saveOnboardingBlocks(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const parsed = onboardingBlocksSchema.safeParse(data);
  if (!parsed.success) return { error: "Ton parcours d'acquisition est invalide." };
  const profile = await getBusinessProfile(userId);
  const result = await saveBusinessSection("acquisition", {
    ...profile.acquisition,
    ...parsed.data,
    blockSelectionInferred: false,
  }, "onboarding");
  if (result.error) return result;

  const blockCatalog = await getFunnelBlockCatalog();
  const selection = normalizeFunnelBlockSelection({ ...profile.acquisition, ...parsed.data }, blockCatalog);
  await track("funnel_blocks_selected", userId, {
    blocks: selection.blocks,
    sources: selection.sources,
    from: "onboarding",
    used_builder: true,
  });
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
  const [acquisitionCatalog, blockCatalog] = await Promise.all([
    getAcquisitionFunnelCatalog(),
    getFunnelBlockCatalog(),
  ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const rawData = await getDiagnosticKpiRawData(userId);
  const allMonthlyRows = rawData.allMonthlyRows;

  const months = allMonthlyRows.map((row) => monthWindowFor(row.year, row.month));
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries: rawData.allSettingEntries,
    allClosingEntries: rawData.allClosingEntries,
    callSourcesByMonth: rawData.allCallSourcesByMonth,
    allSales: rawData.allSales,
    allLeads: rawData.allLeads,
    allLeadStageHistory: rawData.allLeadStageHistory,
    allEmailCampaigns: rawData.allEmailCampaigns,
    allMetaMetrics: rawData.allMetaMetrics,
    allNativeBookingLeads: rawData.allNativeBookingLeads,
  });

  const benchmarks = await getDiagnosticBenchmarks(userRow?.sector ?? null);
  const result = computeOnboardingGoulot({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
    activeMetricKeys: activeLegacyMetricKeysFromBlocks(
      normalizeFunnelBlockSelection(businessProfile.acquisition, blockCatalog),
      blockCatalog
    ).length > 0
      ? activeLegacyMetricKeysFromBlocks(normalizeFunnelBlockSelection(businessProfile.acquisition, blockCatalog), blockCatalog)
      : activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog),
  });

  if (result.kind === "point" && userRow) {
    const minutesSinceSignup = Math.round((Date.now() - userRow.createdAt.getTime()) / 60_000);
    await track("activation_reached", userId, { minutes_since_signup: minutesSinceSignup, metric_key: result.point.key });
  }

  await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/diagnostic-app");
  revalidateBusinessData(userId);

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
  revalidatePath("/roadmap");
  redirect("/roadmap");
}
