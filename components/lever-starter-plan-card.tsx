"use client";

import { useState, useTransition } from "react";

import { Celebration } from "@/components/celebration";
import { Button } from "@/components/ui/button";
import type { StarterPlanStep } from "@/lib/levers/starter-plan";
import { cn } from "@/lib/utils";

// Reused as-is by Mail/Ads/Upsell's mode Démarrer — the checklist is dumb
// (steps/completedSteps/canActivate all come from the page), only the
// checkbox-toggle transitions and the celebration-on-activate are owned
// here. `canActivate` is a PAGE decision (all steps done OR a first real
// data point already entered), never computed by this component.
export function LeverStarterPlanCard({
  steps,
  completedSteps,
  canActivate,
  onToggleStep,
  onActivate,
}: {
  steps: StarterPlanStep[];
  completedSteps: number[];
  canActivate: boolean;
  onToggleStep: (order: number) => Promise<void>;
  onActivate: () => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [justActivated, setJustActivated] = useState(false);

  function handleToggle(order: number) {
    startTransition(async () => {
      await onToggleStep(order);
    });
  }

  function handleActivate() {
    startTransition(async () => {
      await onActivate();
      setJustActivated(true);
    });
  }

  return (
    <div className="sticker-card flex flex-col gap-4 p-6">
      <p className="text-sm font-bold">Plan de lancement</p>
      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const done = completedSteps.includes(step.order);
          return (
            <li key={step.order}>
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => handleToggle(step.order)}
                  disabled={isPending}
                  className="size-4"
                />
                <span className={cn(done && "text-muted-foreground line-through")}>{step.title}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <Button onClick={handleActivate} disabled={isPending || !canActivate} className="self-start">
        Marquer comme lancé
      </Button>
      <Celebration trigger={justActivated} />
    </div>
  );
}
