import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { refreshInstagramInsights } from "@/lib/inngest/functions/refresh-instagram-insights";
import { snapshotScaleScore } from "@/lib/inngest/functions/snapshot-scale-score";
import { syncCalendlyAccount } from "@/lib/inngest/functions/sync-calendly-account";
import { syncIclosedAccount } from "@/lib/inngest/functions/sync-iclosed-account";
import { syncInstagramAccount } from "@/lib/inngest/functions/sync-instagram-account";
import { syncStripeAccount } from "@/lib/inngest/functions/sync-stripe-account";
import { weeklyBriefEmail } from "@/lib/inngest/functions/weekly-brief-email";

// No maxDuration was declared anywhere before this — the platform default
// (10s on a Hobby plan, 60s on Pro) applies otherwise. syncInstagramAccount/
// refreshInstagramInsights run backfillInstagramPosts synchronously inside a
// single step.run, one insights call (+ a throttle delay) per media item —
// an account with a large history can legitimately take minutes. If this
// route's step times out, Inngest retries the whole step from scratch (no
// internal checkpointing in backfillInstagramPosts), which would otherwise
// silently loop without ever finishing for a large account. 300s assumes a
// Vercel plan that allows it (Pro or above) — lower this back down (or
// parallelize the per-item insights fetch instead) if the real plan is
// Hobby, where the platform caps it regardless of this value.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    syncStripeAccount,
    syncIclosedAccount,
    syncCalendlyAccount,
    syncInstagramAccount,
    refreshInstagramInsights,
    weeklyBriefEmail,
    snapshotScaleScore,
  ],
});
