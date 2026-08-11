import { Plus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { getClosingVideoCallOptions, getClosingVideos } from "@/lib/closing-videos/queries";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { VideoFormDialog } from "./video-form-dialog";
import { VideosTable } from "./videos-table";

// Was its own page (/ventes/videos), nested here under Appels — same
// "closing call" subject as Appels' own table, just a different facet
// (recorded video/transcript + AI analysis vs. outcome/attendance
// tracking). Kept on its own dedicated "ventes:videos" permission rather
// than folded under "ventes:appels" like the funnel page below it: video
// transcripts are a meaningfully more sensitive grant than call stats, not
// a legacy duplicate — see lib/team/permissions.ts.
export default async function VentesVideosPage() {
  const t = await getTranslations("sales.closingVideos");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:videos");
  const [videos, callOptions] = await Promise.all([getClosingVideos(accountId), getClosingVideoCallOptions(accountId)]);
  const closedCount = videos.filter((v) => v.outcome === "closed").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/ventes/appels" className="text-sm font-bold text-muted-foreground hover:underline">
            {t("back")}
          </Link>
          <VideoFormDialog
            callOptions={callOptions}
            trigger={
              <Button type="button">
                <Plus className="size-4" />
                {t("addCall")}
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("recordedCalls")}</p>
          <p className="mt-2 font-display text-3xl font-bold">{videos.length}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">{t("closedSales")}</p>
          <p className="mt-2 font-display text-3xl font-bold">{closedCount}</p>
        </div>
      </div>

      <VideosTable videos={videos} callOptions={callOptions} />
    </div>
  );
}
