import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { loadMessagesFor } from "@/lib/i18n/messages";

import { UnifiedAgenda } from "@/app/(app)/ventes/rdv/unified-agenda";
import type { AgendaFilters } from "@/lib/native-booking/validation";

const appointments = [
  {
    id: "native:qa-calendar-booking",
    source: "native" as const,
    sourceLabel: "Minaly",
    startAt: "2026-10-05T08:30:00.000Z",
    endAt: "2026-10-05T09:00:00.000Z",
    durationMinutes: 30,
    durationEstimated: false,
    status: "confirmed" as const,
    prospectName: "Camille Lefèvre",
    email: "camille@example.test",
    phone: null,
    closerId: "11111111-1111-4111-8111-111111111111",
    closerName: "Lina Martin",
    eventName: "Appel découverte",
    nativeBookingId: null,
    salesCallId: null,
    answers: [],
    canManage: false,
    attendance: null,
    outcome: null,
    activities: [],
  },
  {
    id: "iclosed:qa-calendar-call",
    source: "iclosed" as const,
    sourceLabel: "iClosed",
    startAt: "2026-10-06T13:00:00.000Z",
    endAt: "2026-10-06T13:30:00.000Z",
    durationMinutes: 30,
    durationEstimated: true,
    status: "confirmed" as const,
    prospectName: "Youssef Amrani",
    email: "youssef@example.test",
    phone: null,
    closerId: "11111111-1111-4111-8111-111111111111",
    closerName: "Lina Martin",
    eventName: "Closing call",
    nativeBookingId: null,
    salesCallId: null,
    answers: [],
    canManage: false,
    attendance: null,
    outcome: null,
    activities: [],
  },
];

export default async function CalendarAgendaFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; state?: string; view?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const locale = params.locale === "en" ? "en" : "fr";
  const messages = await loadMessagesFor(locale, ["common", "app"]);
  const view = params.view === "week" || params.view === "list" ? params.view : "agenda";
  const filters: AgendaFilters = {
    view,
    source: ["native", "iclosed", "calendly"],
    closerIds: [],
    status: ["confirmed"],
    range: "next7",
    from: null,
    to: null,
    timeZone: "Europe/Paris",
  };

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main lang={locale} className="min-h-screen bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto max-w-6xl">
          <UnifiedAgenda appointments={params.state === "empty" ? [] : appointments} filters={filters} isAccountWide={false} />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
