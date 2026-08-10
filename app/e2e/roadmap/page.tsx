import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { RoadmapView } from "@/app/(app)/roadmap/roadmap-view";
import { buildFixtureData } from "@/app/e2e/journal/page";
import type { WeeklyReportRow } from "@/lib/dashboard/weekly-report";
import type { StreakSnapshot } from "@/lib/streak/service";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";

const fixtureStreak: StreakSnapshot = {
  current: 4,
  best: 9,
  weeklyGoal: 5,
  weeklyDone: 3,
  weeklyGoalMet: false,
  graceUsedMonth: 0,
  graceRemaining: 2,
  reminderOptIn: false,
  todayValidated: true,
  todaySources: [],
  calendar: [],
  celebrateMilestone: null,
  justBrokeFrom: null,
};

const fixtureReports: WeeklyReportRow[] = [
  {
    id: "roadmap-report",
    weekStart: "2026-08-03",
    statsSnapshot: [
      { key: "ca_contracte", label: "CA contracté", valueLabel: "4 280 €", deltaLabel: "+12 %", deltaDirection: "up" },
      { key: "nouveaux_clients", label: "Nouveaux clients", valueLabel: "4", deltaLabel: "+1", deltaDirection: "up" },
      { key: "leads", label: "Leads", valueLabel: "38", deltaLabel: "−4", deltaDirection: "down" },
      { key: "rdv", label: "RDV réservés", valueLabel: "12", deltaLabel: "+2", deltaDirection: "up" },
    ],
    bottleneck: null,
    score: 63,
    scoreDelta: 5,
    generatedAt: "2026-08-10T08:00:00.000Z",
  },
];

export default async function RoadmapE2EFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "navigation", "diagnostic", "roadmap", "app"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto max-w-6xl">
          <p className="mb-5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement · Roadmap</p>
          <RoadmapView fixtureMode data={buildFixtureData()} streak={fixtureStreak} weeklyReports={fixtureReports} />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
