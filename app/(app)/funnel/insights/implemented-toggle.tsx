"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { setInsightImplemented } from "../insight-actions";

// Optimistic with rollback, same shape as setting/editable-kpi-cell.tsx.
// value is tri-state: null = not yet answered, true/false = the user's answer.
export function ImplementedToggle({
  insightId,
  implemented,
}: {
  insightId: string;
  implemented: boolean | null;
}) {
  const [value, setValue] = useState(implemented);
  const [isPending, startTransition] = useTransition();

  function choose(next: boolean) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setInsightImplemented(insightId, next);
      if (result.error) setValue(previous);
    });
  }

  return (
    <div className="flex gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => choose(true)}
        className={cn(
          value === true && "border-state-healthy bg-state-healthy/10 text-state-healthy"
        )}
      >
        Mis en place
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => choose(false)}
        className={cn(
          value === false && "border-state-critical bg-state-critical/10 text-state-critical"
        )}
      >
        Pas mis en place
      </Button>
    </div>
  );
}
