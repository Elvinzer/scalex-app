"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

// Segment-level error boundary for the whole authenticated app. It renders
// INSIDE (app)/layout.tsx, so the sidebar and pillar tabs stay mounted and
// navigation keeps working — a crash in one page no longer takes down the
// entire shell. Without this file, an uncaught render error bubbled all the
// way to Next's root global-error and replaced the full screen, which read as
// "the app is dead, clicking tabs does nothing".
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.shared");

  useEffect(() => {
    // Surface the real cause in the console so an intermittent crash can be
    // traced from a report (the digest ties it to the server logs).
    console.error("[app-error]", error.digest ?? "", error);
    // Ship it server-side too, where the browser console can't reach: this
    // lands the client crash in the Vercel logs. Best-effort — a failed report
    // must never surface on top of the error the user already hit.
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: error.message || "Unknown client error",
        stack: error.stack,
        digest: error.digest,
        url: window.location.pathname + window.location.search,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div role="alert" className="sticker-card flex flex-col gap-4 p-6">
      <div>
        <p className="text-lg font-bold text-state-critical">{t("appErrorTitle")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("appErrorBody")}</p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => reset()}>
          {t("retry")}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          {t("appErrorReload")}
        </Button>
      </div>
    </div>
  );
}
