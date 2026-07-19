"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { saveBusinessSection } from "@/app/(app)/business/actions";
import { CompletionBadge, SaveIndicator } from "@/app/(app)/business/save-indicator";
import { useDebouncedSave } from "@/app/(app)/business/use-debounced-save";
import { Button } from "@/components/ui/button";
import type { BusinessDelivery, ProcessStep } from "@/lib/business/types";
import { cn } from "@/lib/utils";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

function newStep(): ProcessStep {
  return { id: crypto.randomUUID(), title: "", description: "", implemented: false };
}

export function ProcessChecklist({ delivery }: { delivery: BusinessDelivery }) {
  const [steps, setSteps] = useState<ProcessStep[]>(delivery.processSteps);
  const { schedule, status, error } = useDebouncedSave<ProcessStep[]>((next) =>
    saveBusinessSection("delivery", { ...delivery, processSteps: next })
  );

  function commit(next: ProcessStep[]) {
    setSteps(next);
    schedule(next);
  }

  function updateStep(id: string, patch: Partial<ProcessStep>) {
    commit(steps.map((step) => (step.id === id ? { ...step, ...patch } : step)));
  }

  function removeStep(id: string) {
    commit(steps.filter((step) => step.id !== id));
  }

  function addStep() {
    commit([...steps, newStep()]);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  }

  const implementedCount = steps.filter((step) => step.implemented).length;

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Checklist de délivrabilité</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les étapes que tu suis pour chaque client, dans l&apos;ordre.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={implementedCount} total={steps.length} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      {steps.length === 0 && (
        <div className="sticker-card-dashed mt-6 p-6 text-center">
          <p className="text-sm font-medium">Aucune étape pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute ta première étape ci-dessous (ex : email de bienvenue, accès à la formation...).
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {steps.map((step, index) => (
          <div key={step.id} className="rounded-[var(--radius-card)] border border-border p-4">
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Monter"
                  className="flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === steps.length - 1}
                  aria-label="Descendre"
                  className="flex size-6 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                <input
                  type="text"
                  value={step.title}
                  onChange={(event) => updateStep(step.id, { title: event.target.value })}
                  placeholder="Titre de l'étape"
                  className={inputClass}
                />
                <textarea
                  value={step.description}
                  onChange={(event) => updateStep(step.id, { description: event.target.value })}
                  placeholder="Détail (optionnel)"
                  rows={2}
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateStep(step.id, { implemented: true })}
                    className={cn(step.implemented && "border-state-healthy bg-state-healthy/10 text-state-healthy")}
                  >
                    En place
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateStep(step.id, { implemented: false })}
                    className={cn(!step.implemented && "border-state-critical bg-state-critical/10 text-state-critical")}
                  >
                    Pas encore
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Supprimer l'étape"
                  onClick={() => removeStep(step.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" className="mt-4 self-start" onClick={addStep}>
        <Plus className="size-4" />
        Ajouter une étape
      </Button>
    </div>
  );
}
