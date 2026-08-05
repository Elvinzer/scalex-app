import { eq } from "drizzle-orm";

import { db } from "@/db";
import { youtubeConnections, youtubeVideoInsights } from "@/db/schema";
import { runYoutubeSync } from "@/lib/youtube/sync";

// One-off: populate youtube_video_insights.privacy_status for rows synced
// before that column existed. Runs the app's own full sync (no sinceDate =
// whole library, unlike the "Rafraîchir" action's recent-window refresh).
// The backfill is time-budgeted and returns completed:false when it defers
// the tail to a follow-up run, so this loops until it reports completion.
async function main() {
  const connections = await db.select().from(youtubeConnections);
  if (connections.length === 0) throw new Error("aucune connexion YouTube en base");

  for (const connection of connections) {
    console.log(`\n=== compte ${connection.userId} ===`);
    for (let pass = 1; pass <= 10; pass++) {
      const result = await runYoutubeSync(connection);
      console.log(`passe ${pass} : ${result.processed} traitees, ${result.skipped} ignorees, completed=${result.completed}`);
      if (result.completed) break;
    }

    const dist = await db
      .select({ privacyStatus: youtubeVideoInsights.privacyStatus })
      .from(youtubeVideoInsights)
      .where(eq(youtubeVideoInsights.userId, connection.userId));
    const counts = dist.reduce<Record<string, number>>((acc, row) => {
      const key = row.privacyStatus ?? "null";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log("repartition finale :", counts);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
