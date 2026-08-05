import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FalcoPreferencesProvider } from "@/components/falco/falco-context";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { FALCO_SKIN_KEYS } from "@/lib/falco-skins";
import { getBusinessProfile } from "@/lib/business/queries";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { ensureUserRow } from "@/lib/current-user";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeScaleScore, describeScaleScoreGap, type ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import { currentMonthNote, scaleScoreGapMessage } from "@/lib/diagnostic/scale-score-copy";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
import { getScaleScoreDelta, getScaleScoreSparkline } from "@/lib/scale-score-history/queries";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/team/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  const email = data.claims.email;
  const userId = data.claims.sub as string;

  if (typeof email === "string") {
    await ensureUserRow(userId, email);
  }

  const context = await getAccountContext(userId);
  if (!context) {
    // A team member whose account's Scale X subscription lapsed — blocked
    // immediately, not just future invites (see lib/billing/plan-gate.ts).
    return (
      <div className="flex min-h-screen items-center justify-center bg-panel px-4 sm:px-8">
        <div className="sticker-card max-w-md p-6 text-center sm:p-8">
          <p className="text-lg font-bold">Accès suspendu</p>
          <p className="mt-2 text-sm text-muted-foreground">
            L&apos;abonnement Scale X du compte auquel tu es rattaché n&apos;est plus actif.
            Contacte le propriétaire du compte pour rétablir l&apos;accès.
          </p>
        </div>
      </div>
    );
  }
  const { accountId, isOwner } = context;
  const permissions: readonly PermissionKey[] = isOwner ? PERMISSION_KEYS : [...context.permissions] as PermissionKey[];
  // Independent of isOwner/team roles — the founders-only allowlist behind
  // /admin (see lib/admin.ts). Nav visibility only; /admin/layout.tsx still
  // does its own server-side check regardless of this.
  const isAdmin = typeof email === "string" && isAdminEmail(email);
  // Same sensitivity level as the Dashboard's own € hero figure — gated by
  // the same "dashboard" permission rather than always-visible.
  const canSeeScaleScore = isOwner || permissions.includes("dashboard");

  // Runs on every navigation inside (app) — getBusinessProfile, the users
  // row read, and (when visible) the Scale Score's own KPI queries are all
  // independent, so awaiting them one after another was a pure, avoidable
  // round-trip on literally every page change. All scoped by accountId (the
  // business's owner), not userId (who's logged in) — a team member sees
  // the account's business context, never their own empty one.
  const [businessProfile, [userRow], scaleScoreInputs] = await Promise.all([
    getBusinessProfile(accountId),
    db.select().from(users).where(eq(users.id, accountId)).limit(1),
    canSeeScaleScore ? getDiagnosticKpiRawData(accountId) : Promise.resolve(null),
  ]);

  // Proactive "the AI has something to say" signal for the floating bubble
  // — true when the user has real business data to diagnose (not thin/empty)
  // but has never opened a conversation about any specific metric yet
  // (lastImproveMetricKey is only ever set by lib/improve-chat-tracking.ts,
  // when a metric-scoped chat is opened). A simple, no-new-schema proxy for
  // "there's a real bottleneck you haven't discussed with the AI" rather
  // than recomputing the full diagnostic cascade on every navigation.
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !userRow?.lastImproveMetricKey;

  // The sidebar badge always recomputes live from the same cascade engine
  // the Dashboard/Diagnostic use — never reads a cached "current" value.
  // scale_score_history is only consulted for the 7d/30d deltas and the
  // 8-week sparkline, which are structurally impossible to derive live.
  let scaleScore: ScaleScoreResult | null = null;
  let scaleScoreDelta7d: number | null = null;
  let scaleScoreDelta30d: number | null = null;
  let scaleScoreSparkline: Awaited<ReturnType<typeof getScaleScoreSparkline>> = [];
  // "Mon CA si j'optimise tout" (Scale Score modal's share card) — current
  // average monthly revenue + the top-3 Découverte (lever) improvements
  // only. Deliberately EXCLUDES the diagnostic cascade's own gain
  // (computeDiagnosticPoints — the 5 Setting/Closing rates) per explicit
  // product request: "CA optimisé" should reflect CA + improvements from
  // levers you could add, not a re-projection of the diagnostic itself
  // (that number already lives on /diagnostic's own "Le verdict" hero).
  // Dashboard's separate "manque à gagner" figure (app/(app)/dashboard/page.tsx)
  // still includes the cascade gain — the two are deliberately different
  // numbers now, scoped to what each page is asking.
  const SCALE_SCORE_PERIOD_MONTHS = 3;
  let currentMonthlyRevenue: number | null = null;
  let potentialMonthlyRevenue: number | null = null;
  // Only populated when scaleScore.score === null — names the actual
  // blocker instead of a generic "give me your numbers" (see
  // lib/diagnostic/scale-score-copy.ts).
  let scaleScoreGapText: string | null = null;
  let scaleScoreMonthNote: string | null = null;

  if (canSeeScaleScore && scaleScoreInputs) {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = scaleScoreInputs;
    const benchmarks = await getDiagnosticBenchmarks(userRow?.sector ?? null);
    const { settingTotals, closingTotals, cashContractedTotal, emptyMonths } = aggregatePeriodTotals({
      months: lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS),
      allMonthlyRows,
      allSettingEntries,
      allClosingEntries,
    });
    scaleScore = computeScaleScore({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });

    if (scaleScore.score === null) {
      const gap = describeScaleScoreGap(emptyMonths, scaleScore.pillars);
      scaleScoreGapText = gap ? scaleScoreGapMessage(gap) : null;

      // The current month never enters the scoring window (see
      // lastCompletedMonths) — if the user has already started filling it
      // in, say so instead of leaving the placeholder unexplained.
      const currentMonth = currentMonthWindow();
      const currentMonthRow = allMonthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
      const overlay = resolveDailySourceOverlay(currentMonth.range, allSettingEntries, allClosingEntries);
      const currentMonthData = { ...(currentMonthRow ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
      if (monthStatus(computeCompletion(currentMonthData)) !== "empty") {
        scaleScoreMonthNote = currentMonthNote(currentMonth);
      }
    }

    if (cashContractedTotal > 0) {
      // Top-3 Découverte (lever) opportunities only — the diagnostic
      // cascade's own gain is deliberately excluded (see comment above).
      const { toImplement: discoveryOpportunities } = await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: SCALE_SCORE_PERIOD_MONTHS,
        months: lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS),
      });
      const topDiscoveryGain = discoveryOpportunities.slice(0, 3).reduce((sum, o) => sum + (o.impactAmountEur ?? 0), 0);

      currentMonthlyRevenue = cashContractedTotal / SCALE_SCORE_PERIOD_MONTHS;
      potentialMonthlyRevenue = currentMonthlyRevenue + topDiscoveryGain;
    }

    if (scaleScore.score !== null) {
      [scaleScoreDelta7d, scaleScoreDelta30d, scaleScoreSparkline] = await Promise.all([
        getScaleScoreDelta(accountId, 7, scaleScore.score),
        getScaleScoreDelta(accountId, 30, scaleScore.score),
        getScaleScoreSparkline(accountId),
      ]);
    }
  }

  return (
    <FalcoPreferencesProvider reduceAnimations={userRow?.reduceFalcoAnimations ?? false}>
      {/* Portraits are tiny (<20 Ko each) — preloaded once globally so the
          floating chat bubble's crossfade never waits on a first fetch,
          wherever navigation lands first. */}
      {FALCO_SKIN_KEYS.map((skin) => (
        <link key={skin} rel="prefetch" as="image" href={`/falco/skins/portraits/falco-portrait-${skin}.webp`} />
      ))}
      <div className="flex min-h-screen bg-panel">
        <AppSidebar
          email={typeof email === "string" ? email : ""}
          businessName={businessProfile.identity.businessName}
          displayName={userRow?.displayName ?? null}
          avatarUrl={userRow?.avatarUrl ?? null}
          isOwner={isOwner}
          permissions={permissions}
          isAdmin={isAdmin}
          scaleScore={canSeeScaleScore ? scaleScore : null}
          scaleScoreGapText={scaleScoreGapText}
          scaleScoreMonthNote={scaleScoreMonthNote}
          scaleScoreDelta7d={scaleScoreDelta7d}
          scaleScoreDelta30d={scaleScoreDelta30d}
          scaleScoreSparkline={scaleScoreSparkline}
          currentMonthlyRevenue={currentMonthlyRevenue}
          potentialMonthlyRevenue={potentialMonthlyRevenue}
        />
        <main className="min-w-0 flex-1 px-4 pt-20 pb-10 sm:px-8 lg:ml-64 lg:px-16">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
      </div>
    </FalcoPreferencesProvider>
  );
}
