import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { snapshotScaleScore } from "@/lib/inngest/functions/snapshot-scale-score";
import { syncStripeAccount } from "@/lib/inngest/functions/sync-stripe-account";
import { weeklyBriefEmail } from "@/lib/inngest/functions/weekly-brief-email";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [syncStripeAccount, weeklyBriefEmail, snapshotScaleScore],
});
