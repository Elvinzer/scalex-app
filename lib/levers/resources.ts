import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { leverResources } from "@/db/schema";

export type LeverVideo = {
  id: string;
  youtubeUrl: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
  durationLabel: string | null;
};

type OembedResponse = { title: string; author_name: string; thumbnail_url: string };

// YouTube's public oEmbed endpoint — no API key needed, returns
// title/author/thumbnail for any public video. Deliberately does NOT throw:
// a deleted/private video (or a network hiccup) just means that one card is
// silently dropped from the grid (see getLeverVideos), never a broken page.
async function fetchYoutubeOembed(youtubeUrl: string): Promise<OembedResponse | null> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`, {
      next: { revalidate: 86_400 }, // 1 day — thumbnails/titles rarely change
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (typeof data.title !== "string" || typeof data.author_name !== "string" || typeof data.thumbnail_url !== "string") {
      return null;
    }
    return { title: data.title, author_name: data.author_name, thumbnail_url: data.thumbnail_url };
  } catch {
    return null;
  }
}

// Curated rows for this lever (see db/schema.ts's leverResources comment —
// manually picked, never auto-searched), enriched live via oEmbed for
// title/channel/thumbnail. Returns [] when nothing is curated yet — the
// caller (app/(app)/demarrer/[leverKey]/page.tsx) hides the whole "Apprends
// en vidéo" section in that case, never an empty-looking block.
export async function getLeverVideos(leverKey: string): Promise<LeverVideo[]> {
  const rows = await db
    .select()
    .from(leverResources)
    .where(and(eq(leverResources.leverKey, leverKey), eq(leverResources.isActive, true)))
    .orderBy(asc(leverResources.sortOrder));

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const oembed = await fetchYoutubeOembed(row.youtubeUrl);
      if (!oembed) return null;
      return {
        id: row.id,
        youtubeUrl: row.youtubeUrl,
        title: oembed.title,
        channel: oembed.author_name,
        thumbnailUrl: oembed.thumbnail_url,
        durationLabel: row.durationLabel,
      };
    })
  );

  return enriched.filter((video): video is LeverVideo => video !== null);
}
