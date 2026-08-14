import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";
import { listNativeBookingEvents } from "@/lib/native-booking/queries";
import { getBookingPageSettingsView } from "@/lib/booking-page/queries";
import { requireOwnerOrRedirect } from "@/lib/team/context";

import { ReservationCustomizationForm, type ReservationEventOption } from "./reservation-customization-form";

export default async function ReservationSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ event?: string | string[] }>;
}) {
  const t = await getTranslations("app.booking.customization");
  const { userId, accountId } = await getCurrentUser();
  await requireOwnerOrRedirect(userId);

  const [settings, events, bookingHandle] = await Promise.all([
    getBookingPageSettingsView(accountId),
    listNativeBookingEvents(accountId),
    ensureAccountBookingHandle(accountId),
  ]);
  const params = searchParams ? await searchParams : {};
  const requestedEventId = Array.isArray(params.event) ? params.event[0] : params.event;
  const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events.find((event) => event.status === "active") ?? events[0] ?? null;
  const eventOptions: ReservationEventOption[] = events.map((event) => ({
    id: event.id,
    name: event.name,
    slug: event.slug,
    status: event.status,
    description: event.description,
    durationMinutes: event.durationMinutes,
    timeZone: event.timeZone,
    meetingLabel: event.meetingLabel,
    publicHeading: event.publicHeading,
    publicDescription: event.publicDescription,
    confirmationTitle: event.confirmationTitle,
    confirmationMessage: event.confirmationMessage,
    bookingInstructions: event.bookingInstructions,
    publicUrl: `/book/${bookingHandle}/${event.slug}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm font-bold text-accent-text">{t("eyebrow")}</p>
        <h1 className="mt-1 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <ReservationCustomizationForm
        initialSettings={settings}
        events={eventOptions}
        initialEventId={selectedEvent?.id ?? null}
        initialPublicUrl={selectedEvent ? `/book/${bookingHandle}/${selectedEvent.slug}` : null}
      />
    </div>
  );
}
