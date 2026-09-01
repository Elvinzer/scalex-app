import { revalidatePath } from "next/cache";

import { generateCrmCallMatchSuggestion } from "@/lib/crm/call-match-suggestions";
import { crmCallMatchRequested, inngest } from "@/lib/inngest/client";

export const generateCrmCallMatch = inngest.createFunction(
  { id: "generate-crm-call-match", retries: 2, concurrency: { limit: 1, key: "event.data.accountId" }, triggers: [crmCallMatchRequested] },
  async ({ event, step }) => {
    const suggestion = await step.run("generate-suggestion", () => generateCrmCallMatchSuggestion(event.data.accountId, event.data.salesCallId));
    revalidatePath("/crm/appels");
    return { status: suggestion?.status ?? "not_found" };
  },
);
