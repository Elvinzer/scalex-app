"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

import { MonthCard } from "./month-card";
import { MonthModal } from "./month-modal";

export function DatasPageClient({
  year,
  monthRows,
  currentYear,
  currentMonth,
  postLeadsByMonth,
  salesByMonth,
}: {
  year: number;
  monthRows: MonthlyMetricsRow[];
  currentYear: number;
  currentMonth: number;
  postLeadsByMonth: Record<number, number>;
  salesByMonth: Record<number, { contracted: number; collected: number; closedCount: number }>;
}) {
  const [open, setOpen] = useState<{ year: number; month: number } | null>(null);

  const rowFor = (month: number) => monthRows.find((row) => row.month === month) ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Tes datas</h1>
        <p className="mt-1 text-muted-foreground">
          Remplis tes chiffres mois par mois. Tout le reste de l&apos;app se met à jour
          automatiquement.
        </p>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Link
          href={`/datas?year=${year - 1}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Année précédente"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <p className="font-display text-xl font-medium">{year}</p>
        <Link
          href={`/datas?year=${year + 1}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          aria-label="Année suivante"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
          const isFuture = year > currentYear || (year === currentYear && month > currentMonth);
          const isCurrent = year === currentYear && month === currentMonth;
          return (
            <MonthCard
              key={month}
              monthIndex={month}
              row={rowFor(month)}
              isCurrent={isCurrent}
              isFuture={isFuture}
              onOpen={() => setOpen({ year, month })}
            />
          );
        })}
      </div>

      {open && (
        <MonthModal
          key={`${open.year}-${open.month}`}
          year={open.year}
          month={open.month}
          initialData={
            open.year === year ? rowFor(open.month) : null /* navigated to another year, not fetched here */
          }
          monthRowsThisYear={open.year === year ? monthRows : []}
          postLeadsThisMonth={open.year === year ? (postLeadsByMonth[open.month] ?? 0) : 0}
          salesThisMonth={open.year === year ? salesByMonth[open.month] : undefined}
          onClose={() => setOpen(null)}
          onNavigate={(nextYear, nextMonth) => setOpen({ year: nextYear, month: nextMonth })}
        />
      )}
    </div>
  );
}
