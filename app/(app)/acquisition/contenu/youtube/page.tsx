import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { isPublicVideo } from "@/lib/youtube/format";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";

import { YoutubeHooksSection } from "../youtube-hooks-section";
import { YoutubeView } from "../youtube-view";

// Sub-page of /acquisition/contenu (the overview), same nesting pattern as
// /ventes/appels/videos. Private and unlisted uploads are filtered out here,
// once, so nothing downstream (KPI tiles, table, top-3 panel, format
// cohorts) can accidentally count them.
export default async function ContenuYoutubePage() {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  if (!user?.youtubeConnected) redirect("/acquisition/contenu");

  const [posts, youtubeInsights, [youtubeConnection]] = await Promise.all([
    getContentPosts(accountId),
    getYoutubeVideoInsightsMap(accountId),
    db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1),
  ]);

  const videos = Array.from(youtubeInsights.values()).filter(isPublicVideo);

  // Keyed by videoId (== content_posts.externalId for source="youtube") —
  // the manually-entered RDV bookés/closés live on the content_posts row,
  // not on youtube_video_insights.
  const commercialStats = new Map(
    posts
      .filter((post) => post.source === "youtube" && post.externalId)
      .map((post) => [post.externalId as string, { bookings: post.bookings, dealsClosed: post.dealsClosed }])
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">YouTube</h1>
          <p className="mt-1 text-muted-foreground">
            Vues, rétention et RDV générés par chacune de tes vidéos publiques.
          </p>
        </div>
        <Link href="/acquisition/contenu" className="text-sm font-bold text-muted-foreground hover:underline">
          ← Retour au contenu
        </Link>
      </div>

      {/* Famille 2 — placed above the raw table: actionable insights first,
          detail below (the spec's "insights actionnables avant les tableaux
          détaillés"). */}
      <YoutubeHooksSection videos={videos} />

      <YoutubeView
        videos={videos}
        commercialStats={commercialStats}
        subscriberCount={youtubeConnection?.subscriberCount ?? null}
      />
    </div>
  );
}
