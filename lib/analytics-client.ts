"use client";

import posthog from "posthog-js";

// Single point of contact with posthog-js — no other client component
// calls posthog-js directly. Used only for the handful of purely
// client-driven events (improve_chat_opened/engaged) — everything else is
// tracked server-side via lib/analytics.ts, per the analytics plan.
let initialized = false;

export function initPostHogClient(): void {
  if (initialized) return;
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return;

  posthog.init(apiKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
  });
  initialized = true;
}

export function identifyClient(userId: string): void {
  if (!initialized) return;
  posthog.identify(userId);
}

export type ClientAnalyticsEvent = "improve_chat_opened" | "improve_chat_engaged";

export function trackClient(event: ClientAnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, properties);
}
