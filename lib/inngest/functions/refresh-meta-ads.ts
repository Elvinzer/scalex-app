import { and, eq, isNotNull } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { metaAdsConnections } from "@/db/schema";
import { inngest, metaAdsSyncRequested } from "@/lib/inngest/client";
import { syncSelectedMetaAdAccount } from "@/lib/meta-ads/sync";

export const refreshMetaAds = inngest.createFunction(
  { id: "refresh-meta-ads", triggers: [cron("30 */6 * * *")] },
  async ({ step }) => {
    const connections = await step.run("load-connections", async () =>
      db
        .select({ userId: metaAdsConnections.userId })
        .from(metaAdsConnections)
        .where(and(eq(metaAdsConnections.status, "connected"), isNotNull(metaAdsConnections.selectedAdAccountId))),
    );

    const results = await Promise.all(
      connections.map((connection) =>
        step.run(`refresh-${connection.userId}`, async () => {
          try {
            const result = await syncSelectedMetaAdAccount(connection.userId);
            return { userId: connection.userId, refreshed: true, result };
          } catch (error) {
            console.error(`Meta Ads refresh failed for user ${connection.userId}`, error instanceof Error ? error.message : "unknown");
            return { userId: connection.userId, refreshed: false };
          }
        }),
      ),
    );
    for (const result of results) {
      if (!("result" in result) || result.result.completed || !result.result.nextPhase) continue;
      await step.sendEvent(`continue-meta-refresh-${result.userId}-${result.result.nextPhase}`, metaAdsSyncRequested.create({ userId: result.userId, phase: result.result.nextPhase }));
    }
    return { total: connections.length, refreshed: results.filter((result) => result.refreshed).length };
  },
);
