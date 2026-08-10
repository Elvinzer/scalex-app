"use client";

import { Flame } from "lucide-react";
import { useState, useTransition } from "react";

import { Celebration } from "@/components/celebration";
import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { adjustWeeklyGoalAction, toggleStreakReminderAction } from "@/lib/streak/actions";
import { MAX_WEEKLY_GOAL, MIN_WEEKLY_GOAL } from "@/lib/streak/rules";
import type { StreakSnapshot } from "@/lib/streak/service";
import { ACTIVITY_SOURCE_DETAILS, ACTIVITY_SOURCE_LABELS, ACTIVITY_SOURCE_ORDER } from "@/lib/streak/sources";
import { cn } from "@/lib/utils";

const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

// §C's tone rule, applied to every line in this component: a streak at zero is
// a starting point, never a loss. No count of broken streaks is stored
// anywhere, so none can ever be shown.
function falcoMessage(snapshot: StreakSnapshot): string {
  if (snapshot.current === 0) return "Nouvelle série, on repart. Une seule action aujourd'hui suffit à la lancer.";
  if (snapshot.weeklyGoalMet) return `Objectif de la semaine atteint. Ta série tient, même si tu lèves le pied d'ici dimanche.`;
  if (snapshot.current >= 30) return `${snapshot.current} jours d'affilée. C'est devenu une habitude, plus un effort.`;
  if (snapshot.current >= 7) return `${snapshot.current} jours d'affilée. C'est exactement le rythme qui construit un business.`;
  return `${snapshot.current} jour${snapshot.current > 1 ? "s" : ""} d'affilée. Continue, c'est la régularité qui paie.`;
}

export function StreakModal({
  open,
  onOpenChange,
  snapshot,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  snapshot: StreakSnapshot;
}) {
  const [goal, setGoal] = useState(snapshot.weeklyGoal);
  const [reminder, setReminder] = useState(snapshot.reminderOptIn);
  const [isPending, startTransition] = useTransition();

  const progressPercent = Math.min(100, Math.round((snapshot.weeklyDone / goal) * 100));

  function updateGoal(next: number) {
    setGoal(next);
    startTransition(async () => {
      await adjustWeeklyGoalAction(next);
    });
  }

  function updateReminder(next: boolean) {
    setReminder(next);
    startTransition(async () => {
      await toggleStreakReminderAction(next);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Ta série</DialogTitle>

        <Celebration trigger={snapshot.celebrateMilestone !== null} />

        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-full",
              snapshot.current > 0 ? "bg-accent-soft text-accent-text" : "bg-muted text-muted-foreground"
            )}
          >
            <Flame className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-3xl font-bold tabular-nums">
              {snapshot.current} jour{snapshot.current > 1 ? "s" : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Record personnel : {snapshot.best} jour{snapshot.best > 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-[var(--radius-card)] bg-muted/50 p-4">
          <Falco pose={snapshot.current > 0 ? "happy" : "neutral"} size="sm" />
          <p className="text-sm">{falcoMessage(snapshot)}</p>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="streak-goal-title">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="streak-goal-title" className="text-sm font-bold">
              Objectif de la semaine
            </h3>
            <p className="text-sm font-bold tabular-nums">
              {snapshot.weeklyDone}/{goal}
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", snapshot.weeklyGoalMet ? "bg-state-healthy" : "bg-accent")}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Array.from({ length: MAX_WEEKLY_GOAL - MIN_WEEKLY_GOAL + 1 }, (_, index) => MIN_WEEKLY_GOAL + index).map((value) => (
              <button
                key={value}
                type="button"
                disabled={isPending}
                aria-pressed={goal === value}
                onClick={() => updateGoal(value)}
                className={cn(
                  "min-h-11 min-w-11 rounded-[var(--radius-control)] border px-3 text-sm font-bold transition-colors",
                  goal === value
                    ? "border-accent-border bg-accent-soft text-accent-text"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {value}
              </button>
            ))}
          </div>
          {/* Lowering the goal has to feel allowed, so the copy says so
              plainly instead of warning about consequences (§B). */}
          <p className="text-xs text-muted-foreground">
            Calé sur ton rythme réel des 4 dernières semaines. Baisse-le si la période est chargée — atteindre ton objectif
            protège ta série même avec des jours vides.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="streak-calendar-title">
          <h3 id="streak-calendar-title" className="text-sm font-bold">
            Tes 30 derniers jours
          </h3>
          <div className="grid grid-cols-7 gap-1.5" role="list">
            {snapshot.calendar.map((day) => (
              <div
                key={day.date}
                role="listitem"
                title={`${day.date} · ${
                  day.status === "active"
                    ? "actif"
                    : day.status === "grace"
                      ? "jour de grâce"
                      : day.status === "protected"
                        ? "couvert par ton objectif hebdo"
                        : "sans activité"
                }`}
                className={cn(
                  "aspect-square rounded-[6px] border",
                  day.status === "active" && "border-accent bg-accent",
                  day.status === "grace" && "border-accent bg-transparent",
                  day.status === "protected" && "border-state-healthy bg-transparent",
                  day.status === "empty" && "border-border bg-transparent"
                )}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-accent" aria-hidden="true" /> Jour actif
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border border-accent" aria-hidden="true" /> Jour de grâce
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] border border-state-healthy" aria-hidden="true" /> Couvert par ton objectif
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {snapshot.graceRemaining} jour{snapshot.graceRemaining > 1 ? "s" : ""} de grâce restant
            {snapshot.graceRemaining > 1 ? "s" : ""} ce mois-ci. Ils se consomment tout seuls, tu n&apos;as rien à faire.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="streak-sources-title">
          <h3 id="streak-sources-title" className="text-sm font-bold">
            Ce qui valide une journée
          </h3>
          <p className="text-xs text-muted-foreground">Une seule de ces actions suffit. Tout est détecté automatiquement.</p>
          <ul className="flex flex-col gap-2">
            {ACTIVITY_SOURCE_ORDER.map((source) => (
              <li key={source} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    snapshot.todaySources.includes(source) ? "bg-accent" : "bg-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
                <span>
                  <span className="font-bold">{ACTIVITY_SOURCE_LABELS[source]}</span>
                  <span className="text-muted-foreground"> — {ACTIVITY_SOURCE_DETAILS[source]}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-start justify-between gap-4 rounded-[var(--radius-card)] border border-border p-4">
          <div>
            <p className="text-sm font-bold">Rappel en fin de journée</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Un email discret à 19 h les jours sans activité. Désactivé par défaut, et jamais de relance culpabilisante.
            </p>
          </div>
          <Switch checked={reminder} onCheckedChange={updateReminder} disabled={isPending} aria-label="Rappel en fin de journée" />
        </section>

        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="self-start">
          Fermer
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export { WEEKDAY_INITIALS };
