import type { YoutubeVideoInsightRow } from "./queries";

export function netSubscribers(video: Pick<YoutubeVideoInsightRow, "subscribersGained" | "subscribersLost">): number | null {
  if (video.subscribersGained === null || video.subscribersLost === null) return null;
  return video.subscribersGained - video.subscribersLost;
}

export function subscribersPerThousandViews(
  video: Pick<YoutubeVideoInsightRow, "views" | "subscribersGained" | "subscribersLost">,
): number | null {
  const net = netSubscribers(video);
  if (net === null || video.views === null || video.views <= 0) return null;
  return (net / video.views) * 1000;
}

export function revenuePerThousandViews(revenueEur: number | null, views: number | null): number | null {
  if (revenueEur === null || views === null || views <= 0) return null;
  return (revenueEur / views) * 1000;
}

export function bookingsPerThousandViews(bookings: number | null, views: number | null): number | null {
  if (bookings === null || views === null || views <= 0) return null;
  return (bookings / views) * 1000;
}

export function salesPerThousandViews(sales: number | null, views: number | null): number | null {
  if (sales === null || views === null || views <= 0) return null;
  return (sales / views) * 1000;
}
