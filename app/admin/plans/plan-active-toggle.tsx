"use client";

import { useTransition } from "react";

import { setPlanActive } from "./actions";

export function PlanActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await setPlanActive(id, !isActive);
        })
      }
      className={
        isActive
          ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-bold text-signal"
          : "rounded-full border border-border bg-background px-3 py-1 text-xs font-bold text-muted-foreground"
      }
    >
      {isActive ? "Actif" : "Inactif"}
    </button>
  );
}
