"use client";

import { Flame } from "lucide-react";
import { useState } from "react";

import { Celebration } from "@/components/celebration";
import { StreakModal } from "@/components/streak/streak-modal";
import type { StreakSnapshot } from "@/lib/streak/service";
import { cn } from "@/lib/utils";

// The Journal's rhythm strip (§D). Three figures and nothing else: série,
// objectif, activités de la semaine. Any fourth number turns this into the
// dashboard it is explicitly not supposed to be.
export function StreakMomentum({ snapshot }: { snapshot: StreakSnapshot }) {
  const [open, setOpen] = useState(false);
  const lit = snapshot.current > 0;
  const progressPercent = Math.min(100, Math.round((snapshot.weeklyDone / snapshot.weeklyGoal) * 100));

  return (
    <>
      {/* Weekly goal met is a light celebration, distinct from the milestone
          confetti in the modal — both no-op under prefers-reduced-motion. */}
      <Celebration trigger={snapshot.weeklyGoalMet && snapshot.todayValidated} />

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le détail de ta série"
        className="sticker-card flex w-full cursor-pointer flex-wrap items-center gap-x-6 gap-y-3 p-5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <div className="flex items-center gap-3">
          <Flame className={cn("size-6 shrink-0", lit ? "text-accent" : "text-muted-foreground/50")} aria-hidden="true" />
          <div>
            <p className="font-display text-2xl font-bold tabular-nums">
              {snapshot.current} jour{snapshot.current > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-muted-foreground">Série en cours</p>
          </div>
        </div>

        <div className="min-w-[180px] flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs text-muted-foreground">Objectif de la semaine</p>
            <p className="text-sm font-bold tabular-nums">
              {snapshot.weeklyDone}/{snapshot.weeklyGoal}
            </p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", snapshot.weeklyGoalMet ? "bg-state-healthy" : "bg-accent")}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {snapshot.weeklyGoalMet
              ? "Atteint — ta série est protégée jusqu'à dimanche."
              : snapshot.todayValidated
                ? "Journée validée."
                : "Une seule action suffit à valider aujourd'hui."}
          </p>
        </div>
      </button>

      <StreakModal open={open} onOpenChange={setOpen} snapshot={snapshot} />
    </>
  );
}
