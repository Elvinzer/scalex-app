import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { loadMessagesFor } from "@/lib/i18n/messages";
import type { CalendarSettingsView } from "@/lib/native-booking/settings";

import { CalendarSettings } from "@/app/(app)/settings/calendars/calendar-settings";

export default async function CalendarSettingsFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const locale = params.locale === "en" ? "en" : "fr";
  const messages = await loadMessagesFor(locale, ["common", "app"]);
  const initial: CalendarSettingsView = {
    connections: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        provider: "google",
        email: "closer.qa@example.test",
        status: "connected",
        primaryCalendar: { id: "primary", name: locale === "en" ? "Primary calendar" : "Agenda principale", isPrimary: true, canWrite: true },
        loadError: false,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        provider: "google",
        email: "closer.second@example.test",
        status: "connected",
        primaryCalendar: { id: "primary-second", name: locale === "en" ? "Primary calendar" : "Agenda principale", isPrimary: true, canWrite: true },
        loadError: false,
      },
    ],
    invitationConnectionId: "22222222-2222-4222-8222-222222222222",
    conflicts: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    ready: true,
    reason: null,
  };

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="min-h-screen bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto max-w-6xl">
          <CalendarSettings initial={initial} notice={null} />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
