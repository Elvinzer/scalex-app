import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { syncStripeAccount } from "@/lib/inngest/functions/sync-stripe-account";
import { weeklyBriefEmail } from "@/lib/inngest/functions/weekly-brief-email";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [syncStripeAccount, weeklyBriefEmail],
});
