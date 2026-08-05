"use client";

import { Camera } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function formatStat(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(value);
}

export function formatWatchTime(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function InstagramPostDetailDialog({ insight, trigger }: { insight: InstagramPostInsightRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const isStory = insight.mediaType === "STORY";
  // Reels are normalized as media_type "VIDEO" (see lib/instagram/client.ts's
  // listMedia — media_product_type only distinguishes STORY), so this also
  // covers Reels' watch-time stats.
  const isVideo = insight.mediaType === "VIDEO";

  const stats: { label: string; value: string }[] = isStory
    ? [
        { label: "Portée", value: formatStat(insight.reach) },
        { label: "Taps suivant", value: formatStat(insight.storyTapsForward) },
        { label: "Taps précédent", value: formatStat(insight.storyTapsBack) },
        { label: "Sorties", value: formatStat(insight.storyExits) },
        { label: "Réponses", value: formatStat(insight.storyReplies) },
      ]
    : [
        { label: "Portée", value: formatStat(insight.reach) },
        { label: "Impressions", value: formatStat(insight.impressions) },
        { label: "Likes", value: formatStat(insight.likeCount) },
        { label: "Commentaires", value: formatStat(insight.commentsCount) },
        { label: "Enregistrements", value: formatStat(insight.savedCount) },
        { label: "Partages", value: formatStat(insight.sharesCount) },
        ...(isVideo
          ? [
              { label: "Vues vidéo", value: formatStat(insight.videoViews) },
              { label: "Temps de visionnage moyen", value: formatWatchTime(insight.avgWatchTimeMs) },
            ]
          : []),
        { label: "Visites de profil", value: formatStat(insight.profileVisits) },
        { label: "Abonnements générés", value: formatStat(insight.follows) },
      ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-muted-foreground" />
          <DialogTitle>Détail du post Instagram</DialogTitle>
        </div>

        {insight.caption && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{insight.caption}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--radius-control)] border border-border bg-muted p-3">
              <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          Les clics sortants sur un post organique ne sont pas mesurables via l&apos;API Instagram — c&apos;est pour
          ça qu&apos;ils n&apos;apparaissent pas ici.
        </p>

        {insight.permalink && (
          <Button asChild variant="outline" className="mt-4">
            <a href={insight.permalink} target="_blank" rel="noreferrer">
              Voir sur Instagram
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
