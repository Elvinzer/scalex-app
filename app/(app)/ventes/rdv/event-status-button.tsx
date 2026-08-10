"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { toggleNativeBookingEventAction } from "./actions";

export function EventStatusButton({ eventId, status }: { eventId: string; status: "draft" | "active" | "paused" | "archived" }) {
  const t = useTranslations("app.booking");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "active" ? "paused" : "active";

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending || status === "archived"}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await toggleNativeBookingEventAction(eventId, nextStatus);
            if (result.error) setError(result.error);
            else router.refresh();
          });
        }}
        className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
          status === "active"
            ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"
            : status === "paused"
              ? "border-state-caution/30 bg-state-caution/10 text-state-caution"
              : "border-border bg-muted text-muted-foreground"
        }`}
        title={status === "active" ? t("pauseEvent") : t("activateEvent")}
      >
        {isPending ? "…" : status === "active" ? t("active") : status === "paused" ? t("paused") : status === "archived" ? t("archived") : t("draft")}
      </button>
      {error && <span className="max-w-48 text-right text-[11px] font-bold text-state-critical" role="alert">{error}</span>}
    </span>
  );
}
