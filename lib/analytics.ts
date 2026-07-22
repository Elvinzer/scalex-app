import { PostHog } from "posthog-node";

// Single point of contact with posthog-node — no other file in this
// codebase calls posthog-node directly. Server-side tracking is preferred
// per the analytics plan (reliability); see lib/analytics-client.ts for the
// handful of purely client-driven events.
//
// captureImmediate/identifyImmediate (not the queued capture/identify) are
// used deliberately: this app runs on serverless functions that can be
// frozen/killed right after the response is sent, so a queued event with a
// background flush timer could simply never be delivered.
let client: PostHog | null = null;

function getClient(): PostHog | null {
  const apiKey = process.env.POSTHOG_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new PostHog(apiKey, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com" });
  }
  return client;
}

// Every event this app sends, in one place — see the plan doc for the
// exhaustive list this mirrors. Never call posthog-node anywhere else.
export type AnalyticsEvent =
  | "signup"
  | "onboarding_step_completed"
  | "activation_reached"
  | "business_profile_completed"
  | "month_data_filled"
  | "diagnostic_viewed"
  | "improve_chat_opened"
  | "improve_chat_engaged"
  | "weekly_checkin_completed"
  | "weekly_brief_email_clicked"
  | "team_invite_accepted"
  | "discovery_started"
  | "discovery_completed";

// Never throws — a tracking failure must never break the caller's actual
// work (saving data, sending an email, etc).
export async function track(
  event: AnalyticsEvent,
  distinctId: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    await posthog.captureImmediate({ distinctId, event, properties });
  } catch (error) {
    console.error("PostHog track failed", event, error);
  }
}

export async function identifyUser(userId: string, properties: Record<string, unknown>): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    await posthog.identifyImmediate({ distinctId: userId, properties });
  } catch (error) {
    console.error("PostHog identify failed", userId, error);
  }
}
