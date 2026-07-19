"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { TestimonialFormat, TestimonialRow } from "@/lib/testimonials/types";

import { removeTestimonial } from "./actions";
import { TestimonialFormDialog } from "./testimonial-form-dialog";

const FORMAT_LABELS: Record<TestimonialFormat, string> = {
  texte: "Texte",
  video: "Vidéo",
  capture_ecran: "Capture d'écran",
  audio: "Audio",
};

export function TestimonialsList({ testimonials }: { testimonials: TestimonialRow[] }) {
  const [, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await removeTestimonial(id);
    });
  }

  if (testimonials.length === 0) {
    return (
      <div className="sticker-card-dashed p-6 text-center">
        <p className="text-sm font-medium">Aucun témoignage enregistré pour l&apos;instant</p>
        <p className="mt-1 text-sm text-muted-foreground">Ajoute ton premier témoignage ci-dessus.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {testimonials.map((testimonial) => (
        <div key={testimonial.id} className="sticker-card flex flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{testimonial.clientName}</p>
              <p className="text-xs text-muted-foreground">
                {testimonial.collectedAt} · {FORMAT_LABELS[testimonial.format]}
              </p>
            </div>
            <div className="flex gap-1">
              <TestimonialFormDialog
                testimonial={testimonial}
                trigger={
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Modifier">
                    <Pencil className="size-3.5" />
                  </Button>
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Supprimer"
                onClick={() => handleDelete(testimonial.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          {testimonial.content && <p className="text-sm text-muted-foreground">&ldquo;{testimonial.content}&rdquo;</p>}

          {testimonial.url && (
            <a href={testimonial.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline">
              Voir le lien →
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
