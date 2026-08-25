import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { RoadmapView } from "@/app/(app)/roadmap/roadmap-view";
import { buildFixtureData } from "@/app/e2e/journal/page";
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

type RoadmapFixturePageProps = {
  searchParams: Promise<{ year?: string | string[]; month?: string | string[] }>;
};

function parseCalendarParam(value: string | string[] | undefined, fallback: number, min: number, max: number): number {
  const candidate = Array.isArray(value) ? value[0] : value;
  const parsed = candidate ? Number.parseInt(candidate, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export default async function RoadmapE2EFixturePage({ searchParams }: RoadmapFixturePageProps) {
  if (process.env.NODE_ENV === "production") notFound();
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "navigation", "diagnostic", "roadmap", "journal", "app"]);
  const params = await searchParams;
  const calendarYear = parseCalendarParam(params.year, 2026, 2000, 2100);
  const calendarMonth = parseCalendarParam(params.month, 8, 1, 12);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto max-w-6xl">
          <p className="mb-5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement · Roadmap</p>
          <RoadmapView
            fixtureMode
            data={buildFixtureData()}
            streak={fixtureStreak}
            todos={[
              { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "Préparer le brief de la prochaine vidéo", dueDate: "2026-08-08", done: false, projectId: null, isBusinessImprovement: false },
              { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", label: "Réserver le créneau de tournage", dueDate: null, done: true, projectId: null, isBusinessImprovement: false },
            ]}
            projects={[]}
            journalDays={[]}
            calendarYear={calendarYear}
            calendarMonth={calendarMonth}
            todayIso="2026-08-08"
          />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
