"use client";

import { useState } from "react";
import { AlertCircle, Check, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyStatus = "idle" | "copied" | "error";

export function CopyLinkButton({ url, compact = false }: { url: string; compact?: boolean }) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2500);
    }
  }

  const label = status === "copied" ? "Lien copié" : status === "error" ? "Impossible de copier le lien" : "Copier le lien";

  return (
    <Button
      type="button"
      size={compact ? "icon" : "sm"}
      variant="outline"
      className={compact ? "min-h-11 min-w-11" : undefined}
      onClick={copy}
      aria-label={label}
      title={label}
    >
      {status === "copied" ? <Check className="size-4 text-state-healthy" /> : status === "error" ? <AlertCircle className="size-4 text-state-critical" /> : <Link2 className="size-4" />}
      {!compact && (status === "copied" ? "Copié" : status === "error" ? "Réessayer" : "Copier le lien")}
    </Button>
  );
}
