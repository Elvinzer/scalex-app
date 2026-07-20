"use client";

import { X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Same centered-overlay shell as StageInsightPanel — shown instead of the
// question flow when the user has no working BYOK key (missing or flagged
// invalid, see lib/agent/validate-key.ts).
export function KeyRequiredModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="sticker-card w-full max-w-sm p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-bold">Clé Anthropic requise</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Il te faut une clé Anthropic active pour générer un insight. Ajoute (ou remplace) ta
          clé dans Réglages — ça prend deux minutes.
        </p>
        <Button asChild className="mt-5">
          <Link href="/settings">Aller dans Réglages →</Link>
        </Button>
      </div>
    </div>
  );
}
