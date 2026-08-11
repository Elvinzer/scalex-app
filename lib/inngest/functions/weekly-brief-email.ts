import { and, eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { sumChiffrableMonthlyGains } from "@/lib/diagnostic/monthly-gap";
import { computeScaleScore } from "@/lib/diagnostic/scale-score";
import { formatEur } from "@/lib/currency";
import { computeWeeklyStatCards, lastCompleteWeekRange, upsertWeeklyReport } from "@/lib/dashboard/weekly-report";
import { currentIsoWeekRange, inRange } from "@/lib/dashboard/metrics";
import { inngest } from "@/lib/inngest/client";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { getResendClient } from "@/lib/resend-client";
import { getScaleScoreDelta } from "@/lib/scale-score-history/queries";
import { getAppUrl } from "@/lib/utils";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";
import { ensureWeeklyNudges, getActiveNudge } from "@/lib/insight-execution/follow-up";

// Monday 8am, per-user timezone not modeled (single cron time for
// everyone, per spec). This is now the SOLE generator of the Rapport Hebdo
// snapshot (weekly_reports) as well as its email vector — one job, one
// source of truth, per the "ne pas créer de système parallèle" rule (see
// the plan). The stats/bottleneck summarize the week that JUST ENDED
// (lastCompleteWeekRange), while the check-in reminder below looks at the
// week now STARTING (currentIsoWeekRange) — two different week windows for
// two different questions ("how did last week go" vs "have you checked in
// yet this week").
export const weeklyBriefEmail = inngest.createFunction(
  { id: "weekly-brief-email", triggers: [cron("0 8 * * 1")] },
  async ({ step }) => {
    const recipients = await step.run("load-recipients", async () => {
      return db
        .select()
        .from(users)
        .where(and(eq(users.onboardingCompleted, true), eq(users.weeklyEmailEnabled, true), eq(users.isTestAccount, false)));
    });

    const appUrl = getAppUrl();
    // A replayed function run (not a step retry, which Inngest already
    // memoizes) must not re-send an email already sent this week.
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

    await Promise.all(
      recipients.map((user) =>
        step.run(`send-brief-${user.id}`, async () => {
          if (user.lastWeeklyBriefSentAt && new Date(user.lastWeeklyBriefSentAt) > sixDaysAgo) return;

          const businessProfile = await getBusinessProfile(user.id);
          const acquisitionCatalog = await getAcquisitionFunnelCatalog();
          const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
          const activeMetricKeys = activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog);
          const rawData = await getDiagnosticKpiRawData(user.id);
          const { allSettingEntries, allClosingEntries, allMonthlyRows, allSales: sales } = rawData;

          const months = lastCompletedMonths(3);
          const { settingTotals, closingTotals, cashContractedTotal, hasAnySourceData } = aggregatePeriodTotals({
            months,
            allMonthlyRows,
            allSettingEntries,
            allClosingEntries,
            callSourcesByMonth: rawData.allCallSourcesByMonth,
            allSales: sales,
            allLeads: rawData.allLeads,
            allLeadStageHistory: rawData.allLeadStageHistory,
            allEmailCampaigns: rawData.allEmailCampaigns,
            allMetaMetrics: rawData.allMetaMetrics,
            allNativeBookingLeads: rawData.allNativeBookingLeads,
          });
          if (!hasAnySourceData) return; // nothing to report yet

          const benchmarks = await getDiagnosticBenchmarks(user.sector ?? null);
          const points = computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal, activeMetricKeys });
          const { toImplement, toWatch } = await computeLeverOpportunities({
            accountId: user.id,
            businessProfile,
            settingTotals,
            closingTotals,
            cashContractedTotal,
            periodMonths: months.length,
            months,
          });
          const totalMonthlyGain = sumChiffrableMonthlyGains([
            ...points.slice(0, 3).map((point) => point.monthlyGain),
            ...[...toWatch].sort((a, b) => b.score - a.score).slice(0, 3).map((lever) => lever.impactAmountEur),
            ...toImplement.map((lever) => lever.impactAmountEur),
          ]);
          await ensureWeeklyNudges(user.id);
          const activeNudge = await getActiveNudge(user.id);
          const topPoint = points[0];
          if (!topPoint || totalMonthlyGain <= 0) return; // nothing chiffrable to send

          // Scale Score — same 3-month rolling inputs as the sidebar badge,
          // never a "score for this week" (that model doesn't exist, see the
          // plan's Context section).
          const scaleScore = computeScaleScore({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal, activeMetricKeys });
          const scoreDelta = scaleScore.score !== null ? await getScaleScoreDelta(user.id, 7, scaleScore.score) : null;

          // Weekly snapshot — the week that just ended, using only tables
          // with real per-day dates (sales, setting/closing KPI entries).
          const { weekStart, range: weekRange } = lastCompleteWeekRange();
          const previousWeekRange = {
            from: new Date(new Date(`${weekRange.from}T00:00:00Z`).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            to: new Date(new Date(`${weekRange.to}T00:00:00Z`).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          };
          const statsSnapshot = computeWeeklyStatCards({
            weekRange,
            previousWeekRange,
            sales,
            settingEntries: allSettingEntries,
            closingEntries: allClosingEntries,
            callRecords: rawData.allCallRecords,
          });

          await upsertWeeklyReport({
            userId: user.id,
            weekStart,
            statsSnapshot,
            bottleneck: {
              metricKey: topPoint.key,
              label: topPoint.label,
              currentRatePercent: topPoint.currentRatePercent,
              benchmarkRatePercent: topPoint.benchmarkRatePercent,
              monthlyGain: totalMonthlyGain,
            },
            score: scaleScore.score,
            scoreDelta,
          });

          // Has the user already checked in THIS (just-starting) week? Same
          // definition as the Dashboard's own banner (app/(app)/dashboard/
          // page.tsx) — only nag them in the email if they haven't yet.
          const thisWeekRange = currentIsoWeekRange();
          const currentYear = new Date().getUTCFullYear();
          const currentMonth = new Date().getUTCMonth() + 1;
          const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
          const checkInDoneThisWeek =
            allSettingEntries.some((entry) => inRange(entry.date, thisWeekRange)) ||
            allClosingEntries.some((entry) => inRange(entry.date, thisWeekRange)) ||
            currentMonthlyRow !== undefined;

          const firstName = user.email.split("@")[0] || "là";
          const clickUrl = `${appUrl}/api/weekly-email-click?u=${user.id}&utm_source=email&utm_campaign=weekly-brief`;
          const initiativeUrl = activeNudge
            ? `${appUrl}/api/weekly-email-click?u=${user.id}&initiative=${activeNudge.initiativeId}&utm_source=email&utm_campaign=weekly-brief-action`
            : null;
          const nudgeDueLine = activeNudge?.dueDate
            ? ` Échéance : ${new Date(`${activeNudge.dueDate}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.`
            : "";
          const unsubscribeUrl = `${appUrl}/api/unsubscribe?u=${user.id}&token=${signUnsubscribeToken(user.id)}`;

          const scoreLine =
            scaleScore.score !== null
              ? `Scale Score : ${scaleScore.score}/100${scoreDelta !== null ? ` (${scoreDelta > 0 ? "+" : ""}${scoreDelta} vs il y a 7 jours)` : ""}.`
              : null;
          const statsLines = statsSnapshot.map(
            (card) => `${card.label} : ${card.valueLabel}${card.deltaLabel ? ` (${card.deltaLabel})` : ""}`
          );

          const resend = getResendClient();
          await resend.emails.send({
            from: "Scale X <brief@scalex.app>",
            to: user.email,
            subject: `Ton rapport de la semaine, ${firstName}`,
            text: [
              ...statsLines,
              ...(scoreLine ? [scoreLine] : []),
              "",
              `Ton point le plus faible cette semaine : ${topPoint.label} (${topPoint.currentRatePercent}% contre ${topPoint.benchmarkRatePercent}% pour ta niche).`,
              `Manque à gagner estimé : ${formatEur(totalMonthlyGain)}/mois.`,
              ...(activeNudge
                ? [
                    "",
                    `À relancer cette semaine : ${activeNudge.title}. ${activeNudge.reason}${nudgeDueLine}`,
                    ...(initiativeUrl ? [`Reprendre cette action : ${initiativeUrl}`] : []),
                  ]
                : []),
              "",
              `Voir mon rapport complet : ${clickUrl}`,
              ...(checkInDoneThisWeek ? [] : ["", `Faire mon check-in (2 min) : ${clickUrl}`]),
              "",
              `Se désabonner de cet email : ${unsubscribeUrl}`,
            ].join("\n"),
          });

          await db.update(users).set({ lastWeeklyBriefSentAt: new Date() }).where(eq(users.id, user.id));
        })
      )
    );

    return { sent: recipients.length };
  }
);
