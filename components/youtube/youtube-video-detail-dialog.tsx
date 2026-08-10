"use client";

import { MonitorPlay } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { updatePostCommercialStats } from "@/app/(app)/acquisition/contenu/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

function formatStat(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(value);
}

function formatPercentValue(value: number | null, locale: string): string {
  return value === null ? "—" : `${new Intl.NumberFormat(locale).format(Math.round(value * 10) / 10)}%`;
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

function formatSignedStat(value: number | null, locale: string): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${new Intl.NumberFormat(locale).format(value)}`;
}

export function YoutubeVideoDetailDialog({
  insight,
  bookings,
  dealsClosed,
  trigger,
}: {
  insight: YoutubeVideoInsightRow;
  bookings: number | null;
  dealsClosed: number | null;
  trigger: React.ReactNode;
}) {
  const locale = useLocale();
  const t = useTranslations("content.detail");
  const [open, setOpen] = useState(false);
  const [bookingsInput, setBookingsInput] = useState(bookings === null ? "" : String(bookings));
  const [dealsClosedInput, setDealsClosedInput] = useState(dealsClosed === null ? "" : String(dealsClosed));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCommercialStatsBlur() {
    const parsedBookings = bookingsInput === "" ? null : Number(bookingsInput);
    const parsedDealsClosed = dealsClosedInput === "" ? null : Number(dealsClosedInput);
    if (parsedBookings === bookings && parsedDealsClosed === dealsClosed) return;

    setError(null);
    startTransition(async () => {
      const result = await updatePostCommercialStats("youtube", insight.videoId, {
        bookings: parsedBookings,
        dealsClosed: parsedDealsClosed,
      });
      if (result.error) setError(result.error);
    });
  }

  const netSubscribers =
    insight.subscribersGained !== null && insight.subscribersLost !== null ? insight.subscribersGained - insight.subscribersLost : null;

  const stats: { label: string; value: string }[] = [
    { label: t("views"), value: formatStat(insight.views, locale) },
    { label: t("retention"), value: formatPercentValue(insight.averageViewPercentage, locale) },
    { label: t("avgViewDuration"), value: formatDurationSeconds(insight.averageViewDurationSeconds) },
    { label: t("videoDuration"), value: formatDurationSeconds(insight.durationSeconds) },
    { label: t("totalWatchTime"), value: insight.estimatedMinutesWatched === null ? "—" : `${formatStat(insight.estimatedMinutesWatched, locale)} min` },
    { label: t("netSubscribers"), value: formatSignedStat(netSubscribers, locale) },
    { label: t("likes"), value: formatStat(insight.likes, locale) },
    { label: t("comments"), value: formatStat(insight.comments, locale) },
    { label: t("shares"), value: formatStat(insight.shares, locale) },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-2">
          <MonitorPlay className="size-4 text-muted-foreground" />
          <DialogTitle>{t("youtubeTitle")}</DialogTitle>
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

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("commercialTracking")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("youtubeNotice")}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("bookings")}</span>
              <input
                type="number"
                min={0}
                value={bookingsInput}
                onChange={(event) => setBookingsInput(event.target.value)}
                onBlur={handleCommercialStatsBlur}
                disabled={isPending}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">{t("dealsClosed")}</span>
              <input
                type="number"
                min={0}
                value={dealsClosedInput}
                onChange={(event) => setDealsClosedInput(event.target.value)}
                onBlur={handleCommercialStatsBlur}
                disabled={isPending}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>
          {error && <p className="mt-2 text-sm text-state-critical">{error}</p>}
        </div>

        <Button asChild variant="outline" className="mt-4">
          <a href={`https://www.youtube.com/watch?v=${insight.videoId}`} target="_blank" rel="noreferrer">
            {t("viewYoutube")}
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
