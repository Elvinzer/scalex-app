"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Celebration } from "@/components/celebration";
import { Button } from "@/components/ui/button";
import type { StarterPlanStep } from "@/lib/levers/starter-plan";
import { cn } from "@/lib/utils";

// Reused as-is by /demarrer/[leverKey] — the checklist is dumb
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
  onHelpStep,
}: {
  steps: StarterPlanStep[];
  completedSteps: number[];
  canActivate: boolean;
  onToggleStep: (order: number) => Promise<void>;
  onActivate: () => Promise<void>;
  // Renders a "Falco m'aide" button on every step when provided — absent by
  // default so any other caller of this component keeps today's plain
  // checklist (no chat wiring implied).
  onHelpStep?: (order: number) => void;
}) {
  const t = useTranslations("common.shared");
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

  const doneCount = steps.filter((step) => completedSteps.includes(step.order)).length;
  const progressPercent = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="sticker-card flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{t("launchPlan")}</p>
        <p className="text-xs font-bold text-muted-foreground tabular-nums">
          {doneCount}/{steps.length}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-state-healthy transition-[width]" style={{ width: `${progressPercent}%` }} />
      </div>

      <ul className="flex flex-col gap-3">
        {steps.map((step) => {
          const done = completedSteps.includes(step.order);
          return (
            <li key={step.order} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={done}
                onChange={() => handleToggle(step.order)}
                disabled={isPending}
                className="mt-0.5 size-4 shrink-0"
              />
              <div className="flex flex-1 flex-col gap-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("font-bold", done && "text-muted-foreground line-through")}>{step.title}</span>
                  {step.estTime && <span className="text-xs text-muted-foreground">⏱ {step.estTime}</span>}
                </div>
                {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
                {onHelpStep && !done && (
                  <button
                    type="button"
                    onClick={() => onHelpStep(step.order)}
                    className="self-start text-xs font-bold text-accent-2-text hover:underline"
                  >
                    {t("helpFromFalco")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Button onClick={handleActivate} disabled={isPending || !canActivate} className="self-start">
        {t("markLaunched")}
      </Button>
      <Celebration trigger={justActivated} />
    </div>
  );
}
