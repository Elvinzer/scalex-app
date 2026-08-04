import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { refreshInstagramInsights } from "@/lib/inngest/functions/refresh-instagram-insights";
import { snapshotScaleScore } from "@/lib/inngest/functions/snapshot-scale-score";
import { syncCalendlyAccount } from "@/lib/inngest/functions/sync-calendly-account";
import { syncIclosedAccount } from "@/lib/inngest/functions/sync-iclosed-account";
import { syncInstagramAccount } from "@/lib/inngest/functions/sync-instagram-account";
import { syncStripeAccount } from "@/lib/inngest/functions/sync-stripe-account";
import { weeklyBriefEmail } from "@/lib/inngest/functions/weekly-brief-email";

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
