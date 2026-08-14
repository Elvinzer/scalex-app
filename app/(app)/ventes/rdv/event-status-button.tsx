"use client";

import { Pause, Play } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { toggleNativeBookingEventAction } from "./actions";

export function EventStatusButton({ eventId, status }: { eventId: string; status: "draft" | "active" | "paused" | "archived" }) {
  const t = useTranslations("app.booking");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const nextStatus = status === "active" ? "paused" : "active";
  const statusLabel = status === "active" ? t("active") : status === "paused" ? t("paused") : status === "archived" ? t("archived") : t("draft");
  const actionLabel = status === "active" ? t("pauseEvent") : t("activateEvent");

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span
        className={`rounded-full border px-3 py-1 text-xs font-bold ${
          status === "active"
            ? "border-state-healthy/30 bg-state-healthy-bg text-state-healthy"
            : status === "paused"
              ? "border-state-caution/30 bg-state-caution/10 text-state-caution"
              : "border-border bg-muted text-muted-foreground"
        }`}
      >
        {statusLabel}
      </span>
      {status !== "archived" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-pressed={status === "active"}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await toggleNativeBookingEventAction(eventId, nextStatus);
              if (result.error) setError(result.error === "calendar_setup_required" ? t("calendarSetupRequired") : result.error);
              else router.refresh();
            });
          }}
          aria-label={actionLabel}
        >
          {isPending ? "…" : status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {isPending ? t("updatingEvent") : actionLabel}
        </Button>
      )}
      {error && <span className="max-w-48 text-right text-[11px] font-bold text-state-critical" role="alert">{error}</span>}
    </span>
  );
}
