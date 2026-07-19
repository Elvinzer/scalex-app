"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { TestimonialFormat, TestimonialRow } from "@/lib/testimonials/types";

import { saveTestimonial } from "./actions";

const FORMAT_LABELS: Record<TestimonialFormat, string> = {
  texte: "Texte",
  video: "Vidéo",
  capture_ecran: "Capture d'écran",
  audio: "Audio",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TestimonialFormDialog({ testimonial, trigger }: { testimonial?: TestimonialRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = {
      clientName: String(formData.get("clientName") ?? ""),
      format: String(formData.get("format") ?? "texte"),
      content: String(formData.get("content") ?? "") || null,
      url: String(formData.get("url") ?? "") || null,
      collectedAt: String(formData.get("collectedAt") ?? today()),
    };

    startTransition(async () => {
      const result = await saveTestimonial(testimonial?.id ?? null, data);
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
          {testimonial ? "Modifier le témoignage" : "Ajouter un témoignage"}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Client</span>
              <input
                type="text"
                name="clientName"
                required
                defaultValue={testimonial?.clientName ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Format</span>
              <select
                name="format"
                required
                defaultValue={testimonial?.format ?? "texte"}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Contenu (citation, optionnel)</span>
            <textarea
              name="content"
              rows={4}
              defaultValue={testimonial?.content ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de collecte</span>
              <input
                type="date"
                name="collectedAt"
                required
                max={today()}
                defaultValue={testimonial?.collectedAt ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Lien (vidéo, capture...)</span>
              <input
                type="url"
                name="url"
                defaultValue={testimonial?.url ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : testimonial ? "Enregistrer" : "Ajouter le témoignage"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
