import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import type { ContentPostRow } from "@/lib/content-posts/types";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";
import { loadMessagesFor } from "@/lib/i18n/messages";

import { ContenuView } from "@/app/(app)/acquisition/contenu/contenu-view";

type FixtureState = "none" | "instagram" | "youtube" | "both";
type FixturePlatform = "instagram" | "youtube";

const FIXTURE_USER_ID = "33333333-3333-4333-8333-333333333333";
const FIXTURE_SYNCED_AT = new Date("2026-08-04T08:00:00.000Z");

function parseState(value: string | undefined): FixtureState {
  return value === "instagram" || value === "youtube" || value === "both" ? value : "none";
}

function parsePlatform(value: string | undefined): FixturePlatform | null {
  return value === "instagram" || value === "youtube" ? value : null;
}

function fixtureDate(index: number): string {
  if (index === 11) return "2026-01-15";
  if (index === 10) return "2026-07-20";
  if (index === 9) return "2026-05-15";
  return `2026-08-${String(7 - (index % 6)).padStart(2, "0")}`;
}

function fixtureRetentionCurve(index: number): { ratio: number; watchRatio: number }[] | null {
  if (index >= 6) return null;
  const dropRatio = index % 2 === 0 ? 0.45 : 0.7;
  return Array.from({ length: 100 }, (_, point) => {
    const ratio = (point + 1) / 100;
    return { ratio, watchRatio: ratio < dropRatio ? 1 : 0.35 };
  });
}

function createInstagramPost(index: number): ContentPostRow {
  const externalId = `fixture-instagram-${index + 1}`;
  return {
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
    platform: "Instagram",
    type: index % 3 === 0 ? "reel" : "post",
    title: `Instagram fixture post ${index + 1}`,
    publishedAt: fixtureDate(index),
    url: `https://www.instagram.com/p/fixture-${index + 1}`,
    views: 900 - index * 17,
    likes: 80 - index,
    comments: 12,
    shares: 4,
    clicks: null,
    leads: index % 4 === 0 ? 2 : 0,
    bookings: null,
    dealsClosed: null,
    source: "instagram",
    externalId,
    createdAt: `${fixtureDate(index)}T08:00:00.000Z`,
  };
}

function createInstagramInsight(index: number): InstagramPostInsightRow {
  const postDate = fixtureDate(index);
  return {
    id: `44444444-4444-4444-8444-${String(index + 1).padStart(12, "0")}`,
    userId: FIXTURE_USER_ID,
    mediaId: `fixture-instagram-${index + 1}`,
    mediaType: index % 3 === 0 ? "REELS" : "IMAGE",
    caption: `Instagram fixture post ${index + 1}`,
    permalink: `https://www.instagram.com/p/fixture-${index + 1}`,
    mediaUrl: null,
    thumbnailUrl: null,
    mediaPublishedAt: new Date(`${postDate}T08:00:00.000Z`),
    reach: 900 - index * 17,
    impressions: 1100 - index * 20,
    likeCount: 80 - index,
    commentsCount: 12,
    savedCount: 18,
    sharesCount: 4,
    totalInteractions: 114 - index * 3,
    videoViews: index % 3 === 0 ? 600 - index * 10 : null,
    avgWatchTimeMs: index % 3 === 0 ? 8000 : null,
    totalWatchTimeMs: index % 3 === 0 ? 4800000 : null,
    profileVisits: 21,
    follows: 3,
    storyTapsForward: null,
    storyTapsBack: null,
    storyExits: null,
    storyReplies: null,
    rawInsights: {},
    lastFetchedAt: FIXTURE_SYNCED_AT,
  };
}

function createYoutubeVideo(index: number): YoutubeVideoInsightRow {
  const publishedAt = new Date(`${fixtureDate(index)}T08:00:00.000Z`);
  return {
    id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
    userId: FIXTURE_USER_ID,
    videoId: `fixture-youtube-${index + 1}`,
    title: `${index % 2 === 0 ? "Short" : "Vidéo longue"} fixture YouTube ${index + 1}`,
    thumbnailUrl: null,
    durationSeconds: index % 2 === 0 ? 45 : 600,
    creatorContentType: index % 2 === 0 ? "SHORTS" : "VIDEO_ON_DEMAND",
    publishedAt,
    views: 1900 - index * 31,
    likes: 90 - index,
    comments: 8,
    shares: 3,
    estimatedMinutesWatched: 149 - index,
    averageViewDurationSeconds: index % 2 === 0 ? 32 : 384,
    averageViewPercentage: index % 2 === 0 ? 71 : 64,
    subscribersGained: 2,
    subscribersLost: 0,
    impressions: 12000 - index * 100,
    impressionsClickThroughRate: 7.2,
    privacyStatus: "public",
    retentionCurve: fixtureRetentionCurve(index),
    trafficSources: index % 2 === 0
      ? [{ source: "SHORTS", views: 500 - index * 10 }, { source: "YT_SEARCH", views: 120 }]
      : [{ source: "YT_SEARCH", views: 600 - index * 10 }, { source: "BROWSE", views: 160 }],
    searchTerms: index % 2 === 0
      ? [{ term: "trade republic", views: 90 }]
      : [{ term: "pea trade republic", views: 70 }],
    deepInsightsFetchedAt: null,
    productionHours: null,
    rawInsights: {},
    lastFetchedAt: FIXTURE_SYNCED_AT,
  };
}

const instagramPosts = Array.from({ length: 12 }, (_, index) => createInstagramPost(index));
const instagramInsights = new Map(instagramPosts.map((post, index) => [post.externalId!, createInstagramInsight(index)]));
const youtubeVideos = Array.from({ length: 12 }, (_, index) => createYoutubeVideo(index));
const youtubeCommercialStats = new Map(
  youtubeVideos.map((video, index) => [video.videoId, { bookings: index % 3, dealsClosed: index % 4 === 0 ? 1 : 0 }])
);

export default async function ContentE2EFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; platform?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const { state: requestedState, platform: requestedPlatform } = await searchParams;
  const state = parseState(requestedState);
  const initialPlatform = parsePlatform(requestedPlatform);
  const messages = await loadMessagesFor("fr", ["common", "content", "integrations"]);
  const instagramConnected = state === "instagram" || state === "both";
  const youtubeConnected = state === "youtube" || state === "both";

  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement</p>
            <h1 className="mt-1 text-3xl font-bold">Contenu — {state}</h1>
          </div>
          <ContenuView
          initialPlatform={initialPlatform}
          posts={instagramConnected ? instagramPosts : []}
          instagramInsights={instagramConnected ? instagramInsights : new Map()}
          instagramConnected={instagramConnected}
          instagramUsername={instagramConnected ? "fixturefinance" : null}
          instagramSyncStatus={instagramConnected ? "completed" : null}
          instagramLastSyncAt={instagramConnected ? FIXTURE_SYNCED_AT : null}
          youtubeVideos={youtubeConnected ? youtubeVideos : []}
          youtubeCommercialStats={youtubeConnected ? youtubeCommercialStats : new Map()}
          youtubeConnected={youtubeConnected}
          youtubeChannelTitle={youtubeConnected ? "Minaly Fixture Channel" : null}
          youtubeSyncStatus={youtubeConnected ? "completed" : null}
          youtubeLastSyncAt={youtubeConnected ? FIXTURE_SYNCED_AT : null}
          youtubeSubscriberCount={youtubeConnected ? 386 : null}
          youtubeChannelTrafficSources={youtubeConnected ? [
            { contentType: "VIDEO_ON_DEMAND", source: "YT_SEARCH", views: 862 },
            { contentType: "VIDEO_ON_DEMAND", source: "BROWSE", views: 296 },
            { contentType: "VIDEO_ON_DEMAND", source: "RELATED_VIDEO", views: 154 },
            { contentType: "VIDEO_ON_DEMAND", source: "EXT_URL", views: 40 },
            { contentType: "VIDEO_ON_DEMAND", source: "NOTIFICATION", views: 10 },
            { contentType: "VIDEO_ON_DEMAND", source: "PLAYLIST", views: 5 },
            { contentType: "SHORTS", source: "SHORTS", views: 670 },
            { contentType: "SHORTS", source: "SUBSCRIBER", views: 140 },
            { contentType: "SHORTS", source: "YT_SEARCH", views: 90 },
            { contentType: "SHORTS", source: "BROWSE", views: 50 },
            { contentType: "SHORTS", source: "RELATED_VIDEO", views: 20 },
          ] : null}
          youtubeChannelTrafficSourcesFetchedAt={youtubeConnected ? FIXTURE_SYNCED_AT : null}
          youtubeChannelSearchTerms={youtubeConnected ? [
            { term: "trade republic", views: 862 },
            { term: "pea trade republic", views: 296 },
            { term: "trade republic pea", views: 154 },
          ] : null}
          youtubeChannelSearchTermsFetchedAt={youtubeConnected ? FIXTURE_SYNCED_AT : null}
          youtubeAnalyzableVideoCount={youtubeConnected ? youtubeVideos.length : 0}
          subscriptionActive
          hasConnectedPlatform={instagramConnected || youtubeConnected}
          />
        </div>
      </main>
    </NextIntlClientProvider>
  );
}
