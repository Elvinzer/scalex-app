import { getPostLeadsSumByMonth } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getMonthlyMetricsForYear } from "@/lib/monthly-metrics/queries";
import { todayUtc } from "@/lib/date-range";
import { getSalesSummaryByMonth } from "@/lib/sales/queries";

import { DatasPageClient } from "./datas-page-client";

export default async function DatasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { userId } = await getCurrentUser();
  const params = await searchParams;
  const today = todayUtc();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  const year = params.year ? Number(params.year) : currentYear;
  const [monthRows, postLeadsByMonth, salesByMonth] = await Promise.all([
    getMonthlyMetricsForYear(userId, year),
    getPostLeadsSumByMonth(userId, year),
    getSalesSummaryByMonth(userId, year),
  ]);

  return (
    <DatasPageClient
      year={year}
      monthRows={monthRows}
      currentYear={currentYear}
      currentMonth={currentMonth}
      postLeadsByMonth={postLeadsByMonth}
      salesByMonth={salesByMonth}
    />
  );
}
