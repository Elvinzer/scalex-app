import { inngest, nativeBookingCalendarSyncRequested } from "@/lib/inngest/client";
import { retryNativeBookingCalendarSync } from "@/lib/native-booking/booking";

// A provider timeout can happen after it accepted the event. The booking ID
// is reused as the provider idempotency key, so Inngest retries are safe and
// converge on one external event instead of creating a second one.
export const syncNativeBookingCalendar = inngest.createFunction(
  { id: "sync-native-booking-calendar", retries: 3, triggers: [nativeBookingCalendarSyncRequested] },
  async ({ event, step }) => {
    return step.run("sync-calendar", () => retryNativeBookingCalendarSync(event.data.bookingId, event.data.kind ?? "confirmation"));
  }
);
