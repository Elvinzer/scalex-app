"use client";

import { Camera } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";

function formatStat(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(value);
}

export function formatWatchTime(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function InstagramPostDetailDialog({ insight, trigger }: { insight: InstagramPostInsightRow; trigger: React.ReactNode }) {
  const locale = useLocale();
  const t = useTranslations("content.detail");
  const [open, setOpen] = useState(false);
  const isStory = insight.mediaType === "STORY";
  // Reels are normalized as media_type "VIDEO" (see lib/instagram/client.ts's
  // listMedia — media_product_type only distinguishes STORY), so this also
  // covers Reels' watch-time stats.
  const isVideo = insight.mediaType === "VIDEO";

  const stats: { label: string; value: string }[] = isStory
    ? [
        { label: t("reach"), value: formatStat(insight.reach, locale) },
        { label: t("nextTaps"), value: formatStat(insight.storyTapsForward, locale) },
        { label: t("backTaps"), value: formatStat(insight.storyTapsBack, locale) },
        { label: t("exits"), value: formatStat(insight.storyExits, locale) },
        { label: t("replies"), value: formatStat(insight.storyReplies, locale) },
      ]
    : [
        { label: t("reach"), value: formatStat(insight.reach, locale) },
        { label: t("impressions"), value: formatStat(insight.impressions, locale) },
        { label: t("likes"), value: formatStat(insight.likeCount, locale) },
        { label: t("comments"), value: formatStat(insight.commentsCount, locale) },
        { label: t("saves"), value: formatStat(insight.savedCount, locale) },
        { label: t("shares"), value: formatStat(insight.sharesCount, locale) },
        ...(isVideo
          ? [
              { label: t("videoViews"), value: formatStat(insight.videoViews, locale) },
              { label: t("avgWatchTime"), value: formatWatchTime(insight.avgWatchTimeMs) },
            ]
          : []),
        { label: t("profileVisits"), value: formatStat(insight.profileVisits, locale) },
        { label: t("follows"), value: formatStat(insight.follows, locale) },
      ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <div className="flex items-center gap-2">
          <Camera className="size-4 text-muted-foreground" />
          <DialogTitle>{t("instagramTitle")}</DialogTitle>
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
          {t("instagramNotice")}
        </p>

        {insight.permalink && (
          <Button asChild variant="outline" className="mt-4">
            <a href={insight.permalink} target="_blank" rel="noreferrer">
              {t("viewInstagram")}
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
