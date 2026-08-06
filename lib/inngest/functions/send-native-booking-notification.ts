import { inngest, nativeBookingNotificationRequested } from "@/lib/inngest/client";
import { deliverNativeBookingNotification } from "@/lib/native-booking/notifications";

export const sendNativeBookingNotification = inngest.createFunction(
  { id: "send-native-booking-notification", retries: 3, triggers: [nativeBookingNotificationRequested] },
  async ({ event, step }) => {
    return step.run("deliver-notification", () => deliverNativeBookingNotification(event.data.bookingId, event.data.kind));
  }
);
