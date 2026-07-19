import { and, desc, eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { formatEur } from "@/lib/currency";
import { inngest } from "@/lib/inngest/client";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { getResendClient } from "@/lib/resend-client";
import { requireEnv } from "@/lib/utils";
import { signUnsubscribeToken } from "@/lib/unsubscribe-token";

// First scheduled (cron-triggered) Inngest function in this codebase —
// existing functions (e.g. sync-stripe-account.ts) are all event-triggered.
// Monday 8am, per-user timezone not modeled (single cron time for
// everyone, per spec).
export const weeklyBriefEmail = inngest.createFunction(
  { id: "weekly-brief-email", triggers: [cron("0 8 * * 1")] },
  async ({ step }) => {
    const recipients = await step.run("load-recipients", async () => {
      return db
        .select()
        .from(users)
        .where(and(eq(users.onboardingCompleted, true), eq(users.weeklyEmailEnabled, true), eq(users.isTestAccount, false)));
    });

    const appUrl = requireEnv("APP_URL");
    // A replayed function run (not a step retry, which Inngest already
    // memoizes) must not re-send an email already sent this week.
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

    await Promise.all(
      recipients.map((user) =>
        step.run(`send-brief-${user.id}`, async () => {
          if (user.lastWeeklyBriefSentAt && new Date(user.lastWeeklyBriefSentAt) > sixDaysAgo) return;

          const businessProfile = await getBusinessProfile(user.id);
          const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
            db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, user.id)).orderBy(desc(settingKpiEntries.date)),
            db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, user.id)).orderBy(desc(closingKpiEntries.date)),
            getAllMonthlyMetrics(user.id),
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

          const firstName = user.email.split("@")[0] || "là";
          const clickUrl = `${appUrl}/api/weekly-email-click?u=${user.id}&utm_source=email&utm_campaign=weekly-brief`;
          const unsubscribeUrl = `${appUrl}/api/unsubscribe?u=${user.id}&token=${signUnsubscribeToken(user.id)}`;

          const resend = getResendClient();
          await resend.emails.send({
            from: "Scale X <brief@scalex.app>",
            to: user.email,
            subject: `${firstName}, ton goulot de la semaine`,
            text: [
              `Ton point le plus faible cette semaine : ${topPoint.label} (${topPoint.currentRatePercent}% contre ${topPoint.benchmarkRatePercent}% pour ta niche).`,
              `Manque à gagner estimé : ${formatEur(topPoint.monthlyGain)}/mois.`,
              "",
              `Faire mon check-in (2 min) : ${clickUrl}`,
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
