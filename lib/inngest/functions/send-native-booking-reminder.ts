import { inngest, nativeBookingReminderRequested } from "@/lib/inngest/client";
import { deliverNativeBookingReminder, getNativeBookingReminderSchedule } from "@/lib/native-booking/reminders";

export const sendNativeBookingReminder = inngest.createFunction(
  { id: "send-native-booking-reminder", retries: 3, triggers: [nativeBookingReminderRequested] },
  async ({ event, step }) => {
    const scheduledFor = await step.run("read-reminder-schedule", () => getNativeBookingReminderSchedule(event.data.deliveryId));
    if (!scheduledFor) return "skipped" as const;
    await step.sleepUntil("wait-until-due", scheduledFor);
    return step.run("deliver-reminder", () => deliverNativeBookingReminder(event.data.deliveryId));
  }
);
