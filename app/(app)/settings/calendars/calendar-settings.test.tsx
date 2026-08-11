import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enAppMessages from "@/locales/en/app.json";
import frAppMessages from "@/locales/fr/app.json";
import type { CalendarSettingsView } from "@/lib/native-booking/settings";

vi.mock("./actions", () => ({
  disconnectNativeBookingCalendarAction: vi.fn(),
  saveNativeBookingCalendarSettingsAction: vi.fn(),
}));

import { CalendarSettings } from "./calendar-settings";

const initial: CalendarSettingsView = {
  connections: [],
  invitationConnectionId: null,
  conflicts: [],
  ready: false,
  reason: "missing_target",
};

describe("CalendarSettings translations", () => {
  it.each([
    ["fr", frAppMessages],
    ["en", enAppMessages],
  ] as const)("renders without raw message keys in %s", (locale, appMessages) => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={{ app: appMessages }}>
        <CalendarSettings initial={initial} notice={null} />
      </NextIntlClientProvider>
    );

    expect(html).not.toMatch(/app\.[a-zA-Z0-9_.]+/);
    expect(html).not.toContain("providerName");
    expect(html).toContain(locale === "fr" ? "Google Agenda" : "Google Calendar");
    expect(html).toContain(locale === "fr" ? "Tes calendriers" : "Your calendars");
  });
});
