import { PostHog } from "posthog-node";

// Single point of contact with posthog-node — no other file in this
// codebase calls posthog-node directly. Server-side tracking is preferred
// per the analytics plan (reliability); see lib/analytics-client.ts for the
// handful of purely client-driven events.
//
// The queued capture/identify methods are intentional here. Page views run in
// Next.js `after()` callbacks and analytics must never hold the user response
// open while PostHog retries a network request. The SDK still flushes queued
// events while the runtime is warm, with bounded request/retry settings below.
let client: PostHog | null = null;

function getClient(): PostHog | null {
  const apiKey = process.env.POSTHOG_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      requestTimeout: 1000,
      fetchRetryCount: 0,
    });
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
  | "acquisition_funnel_selected"
  | "acquisition_funnel_changed"
  | "funnel_blocks_selected"
  | "funnel_blocks_changed"
  | "source_filter_used"
  | "acquisition_page_viewed"
  | "acquisition_data_saved"
  | "acquisition_page_blocked"
  | "month_data_filled"
  | "diagnostic_viewed"
  | "improve_chat_opened"
  | "improve_chat_engaged"
  | "weekly_checkin_completed"
  | "weekly_brief_email_clicked"
  | "team_invite_accepted"
  | "discovery_started"
  | "discovery_completed"
  | "journal_viewed"
  | "roadmap_viewed"
  | "daily_action_completed"
  | "daily_action_started"
  | "bottleneck_cta_clicked"
  | "roadmap_item_clicked"
  | "todo_completed"
  | "project_milestone_completed"
  | "journal_note_written"
  | "action_started"
  | "action_completed"
  | "action_snoozed"
  | "action_dismissed"
  | "action_result_positive"
  | "stripe_sync_completed"
  | "stripe_sync_failed"
  | "iclosed_sync_completed"
  | "iclosed_sync_failed"
  | "iclosed_call_outcome_set"
  | "calendly_sync_completed"
  | "calendly_sync_failed"
  | "instagram_sync_completed"
  | "instagram_sync_failed"
  | "youtube_sync_completed"
  | "youtube_sync_failed"
  | "lever_page_viewed"
  | "lever_started"
  | "lever_starter_step_done"
  | "lever_guide_opened"
  | "lever_video_clicked"
  | "lever_guide_chat_opened"
  | "agent_chat_opened"
  | "agent_chat_engaged"
  | "weekly_report_viewed"
  | "copilote_page_viewed"
  | "copilote_conversation_opened"
  | "copilote_new_conversation"
  | "copilote_topic"
  | "diagnostic_points_viewed"
  | "diagnostic_point_clicked"
  | "diagnostic_add_viewed"
  | "diagnostic_add_clicked"
  | "lead_created"
  | "lead_stage_changed"
  | "sale_validated"
  | "client_journey_created"
  | "client_stage_changed"
  | "client_at_risk_flagged"
  | "testimonial_added"
  | "setter_added"
  | "commission_pct_changed"
  | "booking_page_customized"
  | "booking_page_preset_background_used"
  | "booking_page_viewed_public"
  | "booking_completed"
  // Contenu insights (F1/F2) — see lib/youtube/attribution.ts.
  | "content_insights_viewed"
  | "video_attribution_declared"
  | "content_insight_clicked"
  | "dormant_video_flagged"
  | "offer_gap_flagged"
  | "content_reco_generated"
  | "content_reco_developed"
  | "content_reco_accepted"
  | "content_reco_published"
  // Journal/Dashboard — "C'est fait" sur l'action du jour.
  | "insight_marked_done"
  // Série d'activité — corréler la longueur de série avec la rétention est
  // le seul moyen de savoir si la mécanique marche (voir lib/streak/).
  | "streak_day_validated"
  | "streak_milestone"
  | "streak_broken"
  | "weekly_goal_met"
  | "weekly_goal_adjusted";

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
    posthog.capture({ distinctId, event, properties });
  } catch (error) {
    console.error("PostHog track failed", event, error);
  }
}

export async function identifyUser(userId: string, properties: Record<string, unknown>): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    posthog.identify({ distinctId: userId, properties });
  } catch (error) {
    console.error("PostHog identify failed", userId, error);
  }
}
