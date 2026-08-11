// Canonical ownership of the numbers used by the cross-page diagnostic.
// Pages may display a projection or a manual fallback, but they must never
// invent a second definition for the same business fact.
export const CANONICAL_METRIC_DEFINITIONS = {
  callsBooked: { source: "sales_calls", unit: "count", role: "conversion input" },
  callsAttended: { source: "sales_calls", unit: "count", role: "conversion input" },
  salesClosed: { source: "sales_calls + sales", unit: "count", role: "conversion output" },
  cashContracted: { source: "sales", unit: "eur", role: "revenue" },
  pipelineClosingRate: { source: "leads + lead_stage_history", unit: "ratio", role: "pipeline conversion" },
  contentRetention: { source: "youtube_video_insights + instagram_post_insights", unit: "ratio", role: "content health", benchmark: 0.5 },
  emailAttribution: { source: "email_campaigns", unit: "mixed", role: "attribution" },
  metaAttribution: { source: "meta_ad_metrics_daily", unit: "mixed", role: "attribution" },
  nativeBookingLeads: { source: "native_booking_leads", unit: "count", role: "attribution" },
} as const;

export type CanonicalMetricKey = keyof typeof CANONICAL_METRIC_DEFINITIONS;
