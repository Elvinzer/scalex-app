"use client";

import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { CallAnalysisChat } from "@/components/call-analysis-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ClosingVideoOutcome, ClosingVideoRow } from "@/lib/closing-videos/types";
import { cn } from "@/lib/utils";

import { removeClosingVideo } from "./actions";
import { VideoFormDialog } from "./video-form-dialog";

const OUTCOME_BADGE: Record<ClosingVideoOutcome, string> = {
  closed: "bg-positive-soft text-positive",
  not_closed: "bg-state-critical/10 text-state-critical",
  pending: "bg-warning-soft text-warning-text",
};

export function VideosTable({ videos }: { videos: ClosingVideoRow[] }) {
  const locale = useLocale();
  const t = useTranslations("sales.closingVideos");
  const [analyzing, setAnalyzing] = useState<ClosingVideoRow | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await removeClosingVideo(id);
    });
  }

  if (videos.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-bold">{t("noCalls")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("noCallsHelp")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="sticker-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("date")}</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("client")}</th>
              <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("outcome")}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => {
              const canAnalyze = Boolean(video.transcript || video.notes);
              return (
                <tr key={video.id} className="border-b border-border last:border-0">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(`${video.callDate}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" })}</td>
                  <td className="p-3">
                    {video.url ? (
                      <a href={video.url} target="_blank" rel="noreferrer" className="font-bold hover:underline">
                        {video.clientName}
                      </a>
                    ) : (
                      <span className="font-bold">{video.clientName}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", OUTCOME_BADGE[video.outcome])}>
                      {t(`outcomes.${video.outcome}`)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!canAnalyze}
                        title={canAnalyze ? undefined : t("analysisHelp")}
                        onClick={() => setAnalyzing(video)}
                      >
                        <MessageCircle className="size-3.5" />
                        {t("analyze")}
                      </Button>
                      <VideoFormDialog
                        video={video}
                        trigger={
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")}>
                            <Pencil className="size-3.5" />
                          </Button>
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        onClick={() => handleDelete(video.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Drawer open={analyzing !== null} onOpenChange={(open) => !open && setAnalyzing(null)}>
        <DrawerContent>
          {analyzing && <CallAnalysisChat videoId={analyzing.id} clientName={analyzing.clientName} />}
        </DrawerContent>
      </Drawer>
    </>
  );
}
