"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { launchInsight, materializeInsight } from "@/lib/insight-execution/actions";
import type { InsightSourceType } from "@/lib/insight-execution/types";

export function QuickInsightLaunchButton({ sourceType, sourceId }: { sourceType: Exclude<InsightSourceType, "copilote">; sourceId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLaunch() {
    setError(null);
    startTransition(async () => {
      const materialized = await materializeInsight({ sourceType, sourceId });
      if (materialized.error || !materialized.insightId) {
        setError(materialized.error ?? "Cette recommandation n'est plus disponible.");
        return;
      }
      const launched = await launchInsight({
        insightId: materialized.insightId,
        targetType: "todo",
        targetId: null,
        dueDate: null,
        makeWeeklyFocus: true,
      });
      if (launched.error) {
        setError(launched.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={handleLaunch}>
        {isPending ? "Lancement..." : "Je lance cette action"}
      </Button>
      {error && <span className="max-w-xs text-xs text-state-critical" role="alert">{error}</span>}
    </div>
  );
}
