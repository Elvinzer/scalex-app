import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { loadMessagesFor } from "@/lib/i18n/messages";
import type { CalendarSettingsView } from "@/lib/native-booking/settings";

import { CalendarSettings } from "@/app/(app)/settings/calendars/calendar-settings";

export default async function CalendarSettingsFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; state?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const locale = params.locale === "en" ? "en" : "fr";
  const messages = await loadMessagesFor(locale, ["common", "app"]);
  const appMessages = messages.app as {
    booking: {
      calendarConnected: string;
      calendarErrors: { oauth: string };
      calendarProviders: { google: string };
    };
  };
  const state = params.state;
  const firstConnectionId = "11111111-1111-4111-8111-111111111111";
  const secondConnectionId = "22222222-2222-4222-8222-222222222222";
  const empty = state === "empty";
  const disconnected = state === "disconnected";
  const initial: CalendarSettingsView = {
    connections: empty ? [] : disconnected ? [
      {
        id: firstConnectionId,
        provider: "google",
        email: "closer.qa@example.test",
        status: "revoked",
        primaryCalendar: null,
        loadError: false,
      },
    ] : [
      {
        id: firstConnectionId,
        provider: "google",
        email: "closer.qa@example.test",
        status: "connected",
        primaryCalendar: { id: "primary", name: locale === "en" ? "Primary calendar" : "Agenda principale", isPrimary: true, canWrite: true },
        loadError: false,
      },
      {
        id: secondConnectionId,
        provider: "google",
        email: "closer.second@example.test",
        status: "connected",
        primaryCalendar: { id: "primary-second", name: locale === "en" ? "Primary calendar" : "Agenda principale", isPrimary: true, canWrite: true },
        loadError: false,
      },
    ],
    invitationConnectionId: empty ? null : disconnected ? firstConnectionId : secondConnectionId,
    conflicts: empty ? [] : disconnected ? [firstConnectionId] : [firstConnectionId, secondConnectionId],
    ready: !empty && !disconnected,
    reason: empty || disconnected ? "missing_target" : null,
  };
  const notice = state === "error"
    ? { tone: "error" as const, text: appMessages.booking.calendarErrors.oauth.replace("{provider}", appMessages.booking.calendarProviders.google) }
    : state === "success"
      ? { tone: "success" as const, text: appMessages.booking.calendarConnected }
      : null;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main lang={locale} className="min-h-screen bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto max-w-6xl">
          <CalendarSettings initial={initial} notice={notice} />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
