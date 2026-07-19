import { rate } from "@/lib/setting/funnel";

import type { ContentPostRates, ContentPostRow } from "./types";

export function computePostRates(post: ContentPostRow): ContentPostRates {
  const engagement = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0);

  return {
    engagementRate: rate(engagement, post.views),
    clickRate: rate(post.clicks ?? 0, post.views),
    viewToLeadRate: rate(post.leads ?? 0, post.views),
  };
}
