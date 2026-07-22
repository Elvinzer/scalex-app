"use client";

import Image from "next/image";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

import { updateProfile } from "./actions";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function ProfileForm({
  userId,
  initialDisplayName,
  initialAvatarUrl,
}: {
  userId: string;
  initialDisplayName: string | null;
  initialAvatarUrl: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("Le fichier doit être une image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image trop lourde (2 Mo maximum).");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const extension = file.name.split(".").pop() || "png";
      const path = `${userId}/avatar.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) {
        setError("Upload impossible — réessaie.");
        return;
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-bust so re-uploading the same filename refreshes the sidebar
      // preview immediately instead of showing a stale cached image.
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);

      const formData = new FormData();
      formData.set("avatarUrl", publicUrl);
      startTransition(async () => {
        const result = await updateProfile(formData);
        if (result.error) setError(result.error);
      });
    } finally {
      setIsUploading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("displayName", displayName);
    startTransition(async () => {
      const result = await updateProfile(formData);
      setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-lg font-bold text-muted-foreground transition-opacity hover:opacity-80"
        >
          {avatarUrl ? (
            <Image src={avatarUrl} alt="Photo de profil" fill sizes="64px" className="object-cover" />
          ) : (
            "?"
          )}
        </button>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? "Envoi..." : "Changer la photo"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">JPG ou PNG, 2 Mo maximum.</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Pseudo (affiché dans le menu)</span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            placeholder="Ton pseudo"
            className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          />
        </label>

        {error && <p className="text-sm text-state-critical">{error}</p>}

        <Button type="submit" disabled={isPending} className="self-start">
          {isPending ? "Enregistrement..." : "Enregistrer le pseudo"}
        </Button>
      </form>
    </div>
  );
}
