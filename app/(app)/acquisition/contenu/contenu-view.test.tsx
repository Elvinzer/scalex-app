import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentPostRow } from "@/lib/content-posts/types";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

const navigationMock = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("@/db", () => ({ db: {} }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/acquisition/contenu",
  useRouter: () => navigationMock,
}));

vi.mock("@/components/instagram/instagram-connection-card", () => ({
  InstagramConnectionCard: ({ connected, username }: { connected: boolean; username?: string | null }) => (
    <div data-testid="instagram-connection-card">
      {connected ? `Instagram connecté @${username ?? ""}` : "Connecter Instagram"}
    </div>
  ),
}));

vi.mock("@/components/youtube/youtube-connection-card", () => ({
  YoutubeConnectionCard: ({ connected, channelTitle }: { connected: boolean; channelTitle?: string | null }) => (
    <div data-testid="youtube-connection-card">
      {connected ? `YouTube connecté ${channelTitle ?? ""}` : "Connecter YouTube"}
    </div>
  ),
}));

import { ContenuView } from "./contenu-view";

const instagramPost: ContentPostRow = {
  id: "11111111-1111-4111-8111-111111111111",
  platform: "instagram",
  type: "post",
  title: "Analyse technique > analyse fondamentale",
  publishedAt: "2026-07-28",
  url: "https://www.instagram.com/p/example",
  views: 743,
  likes: 80,
  comments: 12,
  shares: 4,
  clicks: null,
  leads: 2,
  bookings: null,
  dealsClosed: null,
  source: "instagram",
  externalId: "instagram-media-1",
  createdAt: "2026-07-28T08:00:00.000Z",
};

const instagramInsight: InstagramPostInsightRow = {
  id: "44444444-4444-4444-8444-444444444444",
  userId: "33333333-3333-4333-8333-333333333333",
  mediaId: "instagram-media-1",
  mediaType: "IMAGE",
  caption: "Analyse technique",
  permalink: "https://www.instagram.com/p/example",
  mediaUrl: null,
  thumbnailUrl: null,
  mediaPublishedAt: new Date("2026-07-28T08:00:00.000Z"),
  reach: 743,
  impressions: 900,
  likeCount: 80,
  commentsCount: 12,
  savedCount: 18,
  sharesCount: 4,
  totalInteractions: 114,
  videoViews: null,
  avgWatchTimeMs: null,
  totalWatchTimeMs: null,
  profileVisits: 21,
  follows: 3,
  storyTapsForward: null,
  storyTapsBack: null,
  storyExits: null,
  storyReplies: null,
  rawInsights: {},
  lastFetchedAt: new Date("2026-08-01T08:00:00.000Z"),
};

const youtubeVideo: YoutubeVideoInsightRow = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  videoId: "youtube-video-1",
  title: "L’Analyse technique est incroyable",
  thumbnailUrl: null,
  durationSeconds: 600,
  publishedAt: new Date("2026-07-28T08:00:00.000Z"),
  views: 598,
  likes: 42,
  comments: 8,
  shares: 3,
  estimatedMinutesWatched: 149,
  averageViewDurationSeconds: 384,
  averageViewPercentage: 64,
  subscribersGained: 2,
  subscribersLost: 0,
  impressions: 12000,
  impressionsClickThroughRate: 7.2,
  privacyStatus: "public",
  retentionCurve: null,
  trafficSources: null,
  searchTerms: null,
  deepInsightsFetchedAt: null,
  productionHours: null,
  rawInsights: {},
  lastFetchedAt: new Date("2026-08-01T08:00:00.000Z"),
};

function baseProps() {
  return {
    initialPlatform: "instagram" as const,
    posts: [instagramPost],
    instagramInsights: new Map([[instagramInsight.mediaId, instagramInsight]]),
    instagramConnected: true,
    instagramUsername: "clubvipfinance",
    instagramSyncStatus: "completed",
    instagramSyncCompletedAt: new Date("2026-08-04T08:00:00.000Z"),
    youtubeVideos: [youtubeVideo],
    youtubeCommercialStats: new Map([["youtube-video-1", { bookings: 3, dealsClosed: 1 }]]),
    youtubeConnected: true,
    youtubeChannelTitle: "Cédric Bernard - Club VIP Finance",
    youtubeSyncStatus: "completed",
    youtubeSyncCompletedAt: new Date("2026-08-04T08:00:00.000Z"),
    youtubeSubscriberCount: 386,
    subscriptionActive: true,
    hasConnectedPlatform: true,
  };
}

describe("ContenuView connected panels", () => {
  beforeEach(() => {
    navigationMock.replace.mockClear();
  });

  it("keeps the specialized Instagram panel and connection state", () => {
    const html = renderToStaticMarkup(<ContenuView {...baseProps()} />);

    expect(html).toContain("Instagram connecté @clubvipfinance");
    expect(html).toContain("Vues sur la période");
    expect(html).toContain("30 jours");
    expect(html).toContain("Tes 3 meilleurs posts");
    expect(html).toContain("Tous les posts");
    expect(html).toContain("Analyse technique &gt; analyse fondamentale");
    expect(html).toContain("Taux d&#x27;interaction");
    expect(html).toContain("Visionnage");
    expect(html).toContain("Abonnés");
    expect(html).not.toContain("Toutes les vidéos");
  });

  it("keeps the specialized YouTube panel and commercial metrics", () => {
    const html = renderToStaticMarkup(
      <ContenuView
        {...baseProps()}
        initialPlatform="youtube"
      />
    );

    expect(html).toContain("YouTube connecté Cédric Bernard - Club VIP Finance");
    expect(html).toContain("Shorts");
    expect(html).toContain("Vidéos longues");
    expect(html).toContain("Rétention moyenne");
    expect(html).toContain("Rétention moyenne importée");
    expect(html).not.toContain("Pas encore assez de données de rétention");
    expect(html).toContain("Tes 3 meilleures vidéos");
    expect(html).toContain("Toutes les vidéos");
    expect(html).toContain("L’Analyse technique est incroyable");
    expect(html).toContain("Watch time");
    expect(html).toContain("RDV bookés");
    expect(html).toContain("RDV closés");
    expect(html).not.toContain("Tous les posts");
  });

  it("selects the only connected platform by default", () => {
    const props = baseProps();
    const html = renderToStaticMarkup(
      <ContenuView
        {...props}
        initialPlatform={null}
        instagramConnected={false}
        instagramUsername={null}
        youtubeConnected
      />
    );

    expect(html).toContain("Données de contenu YouTube");
    expect(html).toContain("YouTube connecté Cédric Bernard - Club VIP Finance");
    expect(html).not.toContain("Données de contenu Instagram");
  });
});
