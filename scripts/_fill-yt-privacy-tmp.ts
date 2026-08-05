import postgres from "postgres";

import { decrypt } from "@/lib/crypto";
import { fetchVideoDetails, refreshAccessToken } from "@/lib/youtube/client";
import { requireEnv } from "@/lib/utils";

// Targeted one-off: fills youtube_video_insights.privacy_status for rows that
// predate the column. Deliberately NOT a full runYoutubeSync — that re-fetches
// analytics for every video and opens far more connections than this needs
// (it exhausted the Postgres pool on the first attempt). Here: one DB client
// capped at a single connection, and only videos.list?part=status calls.
const sql = postgres(requireEnv("DATABASE_URL"), { max: 1 });

async function main() {
  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");

  const connections = await sql`select user_id, refresh_token_encrypted from youtube_connections`;
  if (connections.length === 0) throw new Error("aucune connexion YouTube");

  for (const connection of connections) {
    const missing = await sql`
      select video_id from youtube_video_insights
      where user_id = ${connection.user_id} and privacy_status is null
    `;
    console.log(`compte ${connection.user_id} : ${missing.length} video(s) sans statut`);
    if (missing.length === 0) continue;

    const refreshed = await refreshAccessToken(decrypt(connection.refresh_token_encrypted), clientId, clientSecret);
    const ids: string[] = missing.map((row) => row.video_id);

    let updated = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { privacyStatuses } = await fetchVideoDetails(refreshed.accessToken, chunk);
      for (const [videoId, privacyStatus] of privacyStatuses) {
        await sql`
          update youtube_video_insights set privacy_status = ${privacyStatus}
          where user_id = ${connection.user_id} and video_id = ${videoId}
        `;
        updated += 1;
      }
      console.log(`  lot ${i / 50 + 1} : ${updated}/${ids.length} mis a jour`);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  const dist = await sql`select privacy_status, count(*)::int as n from youtube_video_insights group by privacy_status order by n desc`;
  console.log("repartition finale :", JSON.stringify(dist));
}

main()
  .then(async () => {
    await sql.end();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
