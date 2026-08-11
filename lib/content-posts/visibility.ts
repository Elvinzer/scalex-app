import { isPublicVideo } from "@/lib/youtube/format";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

import type { ContentPostRow } from "./types";

// YouTube private/unlisted videos are excluded from every business metric.
// Keep the rule in one place so the content page, Dashboard, Diagnostic and
// Falco inputs cannot disagree about the public channel denominator.
export function filterVisibleContentPosts(
  posts: readonly ContentPostRow[],
  youtubeVideos: readonly Pick<YoutubeVideoInsightRow, "videoId" | "privacyStatus">[]
): ContentPostRow[] {
  const publicVideoIds = new Set(youtubeVideos.filter(isPublicVideo).map((video) => video.videoId));
  return posts.filter(
    (post) => post.source !== "youtube" || (post.externalId !== null && publicVideoIds.has(post.externalId))
  );
}
