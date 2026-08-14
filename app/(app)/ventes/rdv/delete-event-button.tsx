"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { deleteNativeBookingEventAction } from "./actions";

export function DeleteEventButton({ eventId, eventName }: { eventId: string; eventName: string }) {
  const t = useTranslations("app.booking");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function removeEvent() {
    if (!window.confirm(t("deleteEventConfirm", { name: eventName }))) return;
    setError(false);
    startTransition(async () => {
      const result = await deleteNativeBookingEventAction({ eventId });
      if (result.error) {
        setError(true);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={removeEvent}>
        <Trash2 className="size-3.5" />
        {isPending ? t("deletingEvent") : t("deleteEvent")}
      </Button>
      {error && <span className="text-xs font-bold text-state-critical" role="alert">{t("deleteEventError")}</span>}
    </span>
  );
}
