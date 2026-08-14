import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { metaAdsConnections } from "@/db/schema";
import { metaAdsAccountConnected, inngest } from "@/lib/inngest/client";
import { syncMetaAdAccounts } from "@/lib/meta-ads/sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

export const syncMetaAdsAccount = inngest.createFunction(
  { id: "sync-meta-ads-account", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [metaAdsAccountConnected] },
  async ({ event, step }) => {
    const connection = await step.run("load-connection", async () => {
      const [row] = await db
        .select({ id: metaAdsConnections.id })
        .from(metaAdsConnections)
        .where(eq(metaAdsConnections.userId, event.data.userId))
        .limit(1);
      if (!row) throw new NonRetriableError("No Meta Ads connection for this account.");
      return row;
    });

    const result = await step.run("import-ad-accounts", () => syncMetaAdAccounts(event.data.userId));
    revalidateBusinessData(event.data.userId);
    return { connectionId: connection.id, ...result };
  },
);
