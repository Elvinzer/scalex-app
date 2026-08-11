import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { getCalendarSettingsView } from "@/lib/native-booking/settings";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CalendarSettings } from "./calendar-settings";

export default async function CalendarSettingsPage({ searchParams }: { searchParams: Promise<{ calendar_error?: string; provider?: string; calendar?: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:rdv");
  const initial = await getCalendarSettingsView(accountId, userId);
  const params = await searchParams;
  const t = await getTranslations("app.booking");
  const provider = params.provider === "outlook" ? t("calendarProviders.outlook") : t("calendarProviders.google");
  const notice = params.calendar === "connected"
    ? { tone: "success" as const, text: t("calendarConnected") }
    : params.calendar_error === "not_configured"
      ? { tone: "error" as const, text: t("calendarErrors.notConfigured", { provider }) }
      : params.calendar_error === "oauth"
        ? { tone: "error" as const, text: t("calendarErrors.oauth", { provider }) }
        : params.calendar_error === "denied"
          ? { tone: "error" as const, text: t("calendarErrors.denied", { provider }) }
          : params.calendar_error === "state"
            ? { tone: "error" as const, text: t("calendarErrors.state", { provider }) }
            : params.calendar_error === "plan"
              ? { tone: "error" as const, text: t("calendarErrors.plan") }
              : params.calendar_error === "provider"
                ? { tone: "error" as const, text: t("calendarErrors.provider") }
                : null;

  return <CalendarSettings initial={initial} notice={notice} />;
}
