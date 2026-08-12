"use client";

// Single point of contact with posthog-js — no other client component
// calls posthog-js directly. Used only for the handful of purely
// client-driven events (improve_chat_opened/engaged) — everything else is
// tracked server-side via lib/analytics.ts, per the analytics plan.
//
// posthog-js is dynamically imported (not a top-level import) so its code
// ships as its own chunk instead of bloating the initial JS every route
// pays for (this component is mounted in the root layout, so that includes
// every app/(marketing)/ page). The load is kicked off from an idle
// callback — product analytics is a "nice to have," never something first
// paint/hydration should wait on — and identify/track calls below just
// await the same cached promise, so an event that fires before the idle
// callback still triggers (and gets) the load instead of silently no-oping.
let posthogInstance: typeof import("posthog-js").default | null = null;
let loadPromise: Promise<void> | null = null;

function loadPostHog(): Promise<void> {
  if (!loadPromise) {
    loadPromise = import("posthog-js").then(({ default: posthog }) => {
      const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
      if (!apiKey) return;

      posthog.init(apiKey, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false,
      });
      posthogInstance = posthog;
    });
  }
  return loadPromise;
}

export function initPostHogClient(): void {
  if (typeof window === "undefined") return;
  const schedule = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
  schedule(() => void loadPostHog());
}

export function identifyClient(userId: string): void {
  void loadPostHog().then(() => posthogInstance?.identify(userId));
}

export type ClientAnalyticsEvent =
  | "improve_chat_opened"
  | "improve_chat_engaged"
  | "metric_card_share_opened"
  | "metric_card_shared"
  | "score_badge_clicked"
  | "score_modal_share_opened"
  | "opportunity_chat_opened"
  | "datas_trend_metric_switched"
  | "import_started"
  | "import_questions_asked"
  | "import_committed"
  | "import_abandoned"
  | "streak_modal_opened"
  | "source_filter_used";

export function trackClient(event: ClientAnalyticsEvent, properties?: Record<string, unknown>): void {
  void loadPostHog().then(() => posthogInstance?.capture(event, properties));
}
