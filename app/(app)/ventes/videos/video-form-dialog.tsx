"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ClosingVideoOutcome, ClosingVideoRow } from "@/lib/closing-videos/types";

import { saveClosingVideo } from "./actions";

const OUTCOME_LABELS: Record<ClosingVideoOutcome, string> = {
  closed: "Vente conclue",
  not_closed: "Vente non conclue",
  pending: "En attente",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VideoFormDialog({ video, trigger }: { video?: ClosingVideoRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = {
      clientName: String(formData.get("clientName") ?? ""),
      callDate: String(formData.get("callDate") ?? today()),
      url: String(formData.get("url") ?? "") || null,
      transcript: String(formData.get("transcript") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
      outcome: String(formData.get("outcome") ?? "pending"),
    };

    startTransition(async () => {
      const result = await saveClosingVideo(video?.id ?? null, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-medium">
          {video ? "Modifier l'appel" : "Ajouter un appel"}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Client</span>
              <input
                type="text"
                name="clientName"
                required
                defaultValue={video?.clientName ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de l&apos;appel</span>
              <input
                type="date"
                name="callDate"
                required
                max={today()}
                defaultValue={video?.callDate ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Issue</span>
              <select
                name="outcome"
                required
                defaultValue={video?.outcome ?? "pending"}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Lien (enregistrement)</span>
              <input
                type="url"
                name="url"
                defaultValue={video?.url ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Transcription (optionnel, pour l&apos;analyse IA)</span>
            <textarea
              name="transcript"
              rows={6}
              defaultValue={video?.transcript ?? ""}
              placeholder="Colle la transcription de l'appel ici si tu en as une..."
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Notes (si pas de transcription)</span>
            <textarea
              name="notes"
              rows={3}
              defaultValue={video?.notes ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : video ? "Enregistrer" : "Ajouter l'appel"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
