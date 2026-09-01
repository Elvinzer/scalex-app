"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { queueHistoricalCrmCallMatchesAction } from "./crm-actions";

export function CrmCallMatchBatchControl() {
  const t = useTranslations("crm.calls");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function analyze(): void {
    setMessage(null);
    startTransition(async () => {
      const result = await queueHistoricalCrmCallMatchesAction({ limit: 25 });
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(result.queued > 0 ? t("batchQueued", { count: result.queued }) : t("batchEmpty"));
    });
  }

  return <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={analyze} disabled={isPending}>{isPending ? t("match.pending") : t("batchAnalyze")}</Button>{message && <p className="text-xs font-bold text-muted-foreground" role="status">{message}</p>}</div>;
}
