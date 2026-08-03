"use client";

import type { LeverVideo } from "@/lib/levers/resources";
import { recordLeverVideoClicked } from "@/lib/levers/demarrer-tracking";

// Horizontal scroll — 6-7 curated videos per lever (ranked by YouTube view
// count, see scripts/seed-lever-resources.mjs) don't fit a static grid
// without either cramming or excess vertical space; a carousel keeps the
// most-viewed video first and reachable without scrolling the whole page.
// Same overflow-x-auto pattern as kanban-board.tsx's columns row.
export function LeverVideoGrid({ leverKey, videos }: { leverKey: string; videos: LeverVideo[] }) {
  return (
    <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
      {videos.map((video) => (
        <a
          key={video.id}
          href={video.youtubeUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => void recordLeverVideoClicked(leverKey, video.title)}
          className="sticker-card flex w-64 shrink-0 snap-start flex-col overflow-hidden p-0 hover:border-border-hover sm:w-72"
        >
          <div className="relative aspect-video w-full bg-muted">
            {/* External YouTube thumbnail — plain img, not next/image (no
                remote-pattern config for this domain), lazy-loaded. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={video.thumbnailUrl} alt={video.title} loading="lazy" className="size-full object-cover" />
            {video.durationLabel && (
              <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white">
                {video.durationLabel}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 p-3">
            <p className="text-sm font-bold">{video.title}</p>
            <p className="text-xs text-muted-foreground">{video.channel}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
