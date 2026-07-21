import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getClosingVideos } from "@/lib/closing-videos/queries";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { VideoFormDialog } from "./video-form-dialog";
import { VideosTable } from "./videos-table";

export default async function VideosPage() {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:videos");
  const videos = await getClosingVideos(accountId);
  const closedCount = videos.filter((v) => v.outcome === "closed").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Vidéos de closing</h1>
          <p className="mt-1 text-muted-foreground">
            Chaque appel de closing, avec transcription ou notes — et une analyse IA à la demande.
          </p>
        </div>
        <VideoFormDialog
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              Ajouter un appel
            </Button>
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Appels enregistrés</p>
          <p className="mt-2 font-display text-3xl font-bold">{videos.length}</p>
        </div>
        <div className="sticker-card flex flex-col p-5">
          <p className="text-sm font-bold text-muted-foreground">Ventes conclues</p>
          <p className="mt-2 font-display text-3xl font-bold">{closedCount}</p>
        </div>
      </div>

      <VideosTable videos={videos} />
    </div>
  );
}
