"use client";

import { MonitorPlay } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function formatStat(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(value);
}

function formatPercentValue(value: number | null): string {
  return value === null ? "—" : `${NUMBER_FORMAT.format(Math.round(value * 10) / 10)}%`;
}

// seconds -> "m:ss" (or "h:mm:ss" past an hour) — used for both a video's
// own duration and its average view duration.
export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function formatSignedStat(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${NUMBER_FORMAT.format(value)}`;
}

export function YoutubeVideoDetailDialog({ insight, trigger }: { insight: YoutubeVideoInsightRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  const netSubscribers =
    insight.subscribersGained !== null && insight.subscribersLost !== null ? insight.subscribersGained - insight.subscribersLost : null;

  const stats: { label: string; value: string }[] = [
    { label: "Vues", value: formatStat(insight.views) },
    { label: "Rétention moyenne", value: formatPercentValue(insight.averageViewPercentage) },
    { label: "Durée de vue moyenne", value: formatDurationSeconds(insight.averageViewDurationSeconds) },
    { label: "Durée de la vidéo", value: formatDurationSeconds(insight.durationSeconds) },
    { label: "Watch time total", value: insight.estimatedMinutesWatched === null ? "—" : `${formatStat(insight.estimatedMinutesWatched)} min` },
    { label: "Abonnés (net)", value: formatSignedStat(netSubscribers) },
    { label: "Likes", value: formatStat(insight.likes) },
    { label: "Commentaires", value: formatStat(insight.comments) },
    { label: "Partages", value: formatStat(insight.shares) },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-2">
          <MonitorPlay className="size-4 text-muted-foreground" />
          <DialogTitle>Détail de la vidéo YouTube</DialogTitle>
        </div>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{insight.title}</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[var(--radius-control)] border border-border bg-muted p-3">
              <p className="text-xs font-bold text-muted-foreground">{stat.label}</p>
              <p className="mt-1 font-display text-lg font-bold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        <Button asChild variant="outline" className="mt-4">
          <a href={`https://www.youtube.com/watch?v=${insight.videoId}`} target="_blank" rel="noreferrer">
            Voir sur YouTube
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
