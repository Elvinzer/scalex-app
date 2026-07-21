import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getPostLeadsSumByMonth } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getMonthlyMetricsForYear } from "@/lib/monthly-metrics/queries";
import { todayUtc } from "@/lib/date-range";
import { getSalesSummaryByMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { DatasPageClient } from "./datas-page-client";

export default async function DatasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "datas");
  const params = await searchParams;
  const today = todayUtc();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  const year = params.year ? Number(params.year) : currentYear;
  const [monthRows, postLeadsByMonth, salesByMonth, allSettingEntries, allClosingEntries] = await Promise.all([
    getMonthlyMetricsForYear(accountId, year),
    getPostLeadsSumByMonth(accountId, year),
    getSalesSummaryByMonth(accountId, year),
    // Whole history, not just `year` — MonthModal can navigate across year
    // boundaries client-side, and the daily-source overlay must follow.
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
  ]);

  return (
    <DatasPageClient
      year={year}
      monthRows={monthRows}
      currentYear={currentYear}
      currentMonth={currentMonth}
      postLeadsByMonth={postLeadsByMonth}
      salesByMonth={salesByMonth}
      allSettingEntries={allSettingEntries}
      allClosingEntries={allClosingEntries}
    />
  );
}
