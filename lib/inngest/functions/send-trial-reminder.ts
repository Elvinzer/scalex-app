import { z } from "zod";

import { billingTrialReminderRequested, inngest } from "@/lib/inngest/client";
import { sendTrialReminderEmail, trialReminderPayloadSchema } from "@/lib/billing/trial-reminder";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";

const TWO_DAYS_IN_SECONDS = 2 * 24 * 60 * 60;

export const sendTrialReminder = inngest.createFunction(
  { id: "send-trial-reminder", retries: 3, triggers: [billingTrialReminderRequested] },
  async ({ event, step }) => {
    const payload = trialReminderPayloadSchema.safeParse(event.data);
    if (!payload.success) return { sent: false, reason: "invalid_payload" };

    const reminderAt = new Date((payload.data.trialEnd - TWO_DAYS_IN_SECONDS) * 1000);
    if (reminderAt.getTime() > Date.now()) {
      await step.sleepUntil("wait-until-j-minus-2", reminderAt);
    }

    return step.run("send-trial-reminder-email", async () => {
      const subscription = await getPlatformStripeClient().subscriptions.retrieve(payload.data.subscriptionId);
      const currentSubscription = z
        .object({ status: z.string(), trial_end: z.number().int().positive().nullable() })
        .safeParse(subscription);
      if (!currentSubscription.success || currentSubscription.data.status !== "trialing" || currentSubscription.data.trial_end !== payload.data.trialEnd) {
        return { sent: false, reason: "trial_changed" };
      }

      return { sent: await sendTrialReminderEmail(payload.data) };
    });
  }
);
