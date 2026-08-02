import { and, desc, eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeScaleScore } from "@/lib/diagnostic/scale-score";
import { formatEur } from "@/lib/currency";
import { computeWeeklyStatCards, lastCompleteWeekRange, upsertWeeklyReport } from "@/lib/dashboard/weekly-report";
import { currentIsoWeekRange, inRange } from "@/lib/dashboard/metrics";
import { inngest } from "@/lib/inngest/client";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { getResendClient } from "@/lib/resend-client";
import { getSales } from "@/lib/sales/queries";
import { getScaleScoreDelta } from "@/lib/scale-score-history/queries";
import { getAppUrl } from "@/lib/utils";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";

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
          const [allSettingEntries, allClosingEntries, allMonthlyRows, sales] = await Promise.all([
            db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, user.id)).orderBy(desc(settingKpiEntries.date)),
            db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, user.id)).orderBy(desc(closingKpiEntries.date)),
            getAllMonthlyMetrics(user.id),
            getSales(user.id),
          ]);

          const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
            months: lastCompletedMonths(3),
            allMonthlyRows,
            allSettingEntries,
            allClosingEntries,
          });
          if (!hasAnyMonthlyRow) return; // nothing to report yet

          const benchmarks = await getDiagnosticBenchmarks(user.sector ?? null);
          const points = computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });
          const topPoint = points[0];
          if (!topPoint || topPoint.monthlyGain === null) return; // nothing chiffrable to send

          // Scale Score — same 3-month rolling inputs as the sidebar badge,
          // never a "score for this week" (that model doesn't exist, see the
          // plan's Context section).
          const scaleScore = computeScaleScore({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });
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
              monthlyGain: topPoint.monthlyGain,
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
              `Manque à gagner estimé : ${formatEur(topPoint.monthlyGain)}/mois.`,
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
