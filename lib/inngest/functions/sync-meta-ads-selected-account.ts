import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { metaAdsConnections } from "@/db/schema";
import { inngest, metaAdsSyncRequested } from "@/lib/inngest/client";
import { syncSelectedMetaAdAccount } from "@/lib/meta-ads/sync";

export const syncMetaAdsSelectedAccount = inngest.createFunction(
  { id: "sync-meta-ads-selected-account", triggers: [metaAdsSyncRequested] },
  async ({ event, step }) => {
    await step.run("load-connection", async () => {
      const [row] = await db
        .select({ selectedAdAccountId: metaAdsConnections.selectedAdAccountId })
        .from(metaAdsConnections)
        .where(eq(metaAdsConnections.userId, event.data.userId))
        .limit(1);
      if (!row) throw new NonRetriableError("No Meta Ads connection for this account.");
      if (!row.selectedAdAccountId) throw new NonRetriableError("No Meta Ads account selected.");
      return row;
    });

    const result = await step.run("sync-selected-account", () => syncSelectedMetaAdAccount(event.data.userId, undefined, event.data.phase));
    if (!result.completed && result.nextPhase) {
      await step.sendEvent(`continue-meta-sync-${event.data.userId}-${result.nextPhase}`, metaAdsSyncRequested.create({ userId: event.data.userId, phase: result.nextPhase }));
    }
    return result;
  },
);
