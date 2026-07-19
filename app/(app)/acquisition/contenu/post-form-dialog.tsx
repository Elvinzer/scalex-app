"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ContentPostRow, ContentPostType } from "@/lib/content-posts/types";

import { saveContentPost } from "./actions";

const TYPE_LABELS: Record<ContentPostType, string> = {
  post: "Post",
  reel: "Reel",
  story: "Story",
  video: "Vidéo",
  live: "Live",
};

const COUNT_FIELDS = [
  { name: "views", label: "Vues", required: true },
  { name: "likes", label: "Likes", required: false },
  { name: "comments", label: "Commentaires", required: false },
  { name: "shares", label: "Partages", required: false },
  { name: "clicks", label: "Clics", required: false },
  { name: "leads", label: "Leads", required: false },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PostFormDialog({
  platforms,
  post,
  trigger,
}: {
  platforms: string[];
  post?: ContentPostRow;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const numberOrNull = (name: string) => {
      const raw = formData.get(name);
      return raw === "" || raw === null ? null : Number(raw);
    };

    const data = {
      platform: String(formData.get("platform") ?? ""),
      type: String(formData.get("type") ?? "post"),
      title: String(formData.get("title") ?? ""),
      publishedAt: String(formData.get("publishedAt") ?? today()),
      url: String(formData.get("url") ?? "") || null,
      views: Number(formData.get("views") ?? 0),
      likes: numberOrNull("likes"),
      comments: numberOrNull("comments"),
      shares: numberOrNull("shares"),
      clicks: numberOrNull("clicks"),
      leads: numberOrNull("leads"),
    };

    startTransition(async () => {
      const result = await saveContentPost(post?.id ?? null, data);
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
          {post ? "Modifier le post" : "Ajouter un post"}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Plateforme</span>
              {platforms.length > 0 ? (
                <select
                  name="platform"
                  required
                  defaultValue={post?.platform ?? platforms[0]}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                >
                  {platforms.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  name="platform"
                  required
                  defaultValue={post?.platform ?? ""}
                  placeholder="Instagram, YouTube..."
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              )}
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Type</span>
              <select
                name="type"
                required
                defaultValue={post?.type ?? "post"}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Titre</span>
            <input
              type="text"
              name="title"
              required
              defaultValue={post?.title ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de publication</span>
              <input
                type="date"
                name="publishedAt"
                required
                max={today()}
                defaultValue={post?.publishedAt ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Lien (optionnel)</span>
              <input
                type="url"
                name="url"
                defaultValue={post?.url ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {COUNT_FIELDS.map((field) => (
              <label key={field.name} className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{field.label}</span>
                <input
                  type="number"
                  name={field.name}
                  min={0}
                  required={field.required}
                  defaultValue={post?.[field.name] ?? ""}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : post ? "Enregistrer" : "Ajouter le post"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
