"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

import { updateBookingHandleAction } from "../actions";

const inputClass =
  "min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

// Le handle est propre au COMPTE (partagé par tous les events de booking) :
// l'éditer ici change le préfixe /book/{handle} de toutes les pages de réservation.
export function BookingHandleEditor({ initialHandle }: { initialHandle: string }) {
  const t = useTranslations("app.booking.editor");
  const [handle, setHandle] = useState(initialHandle);
  const [saved, setSaved] = useState(initialHandle);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const normalized = handle.trim().toLowerCase();
  const dirty = normalized !== saved;

  async function save() {
    setStatus("saving");
    setError(null);
    setJustSaved(false);
    const res = await updateBookingHandleAction({ handle });
    setStatus("idle");
    if (res.error) {
      setError(res.error);
      return;
    }
    setSaved(normalized);
    setHandle(normalized);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2200);
  }

  return (
    <div className="sticker-card flex flex-col gap-3 p-4">
      <div>
        <p className="text-sm font-bold">{t("handleTitle")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("handleHelp")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <span className="shrink-0 font-mono text-sm text-muted-foreground">/book/</span>
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            spellCheck={false}
            autoCapitalize="none"
            className={inputClass}
            aria-label={t("handleLabel")}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={save} disabled={status === "saving" || !dirty}>
          {status === "saving" ? "..." : justSaved ? <><Check className="size-4 text-state-healthy" /> {t("saved")}</> : t("save")}
        </Button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-state-critical">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}
