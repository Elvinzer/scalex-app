"use client";

import { useState, useTransition } from "react";

import { Celebration } from "@/components/celebration";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

import { toggleMilestone } from "./actions";

type Milestone = { order: number; title: string; done: boolean; doneAt: string | null };
type Project = { id: string; name: string; category: string; milestones: Milestone[]; status: string };
type Todo = { id: string; label: string; done: boolean };

const CATEGORY_LABEL: Record<string, string> = {
  acquisition: "Acquisition",
  vente: "Vente",
  delivrabilite: "Délivrabilité",
  autre: "Autre",
};

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function ProjectDrawer({
  project,
  linkedTodos,
  onClose,
}: {
  project: Project | null;
  linkedTodos: Todo[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [celebrate, setCelebrate] = useState(false);

  if (!project) return null;

  function handleToggle(order: number, done: boolean) {
    startTransition(async () => {
      const result = await toggleMilestone(project!.id, order, done);
      if (result.justCompleted) setCelebrate(true);
    });
  }

  const completedMilestones = project.milestones.filter((m) => m.doneAt !== null).sort((a, b) => (a.doneAt! < b.doneAt! ? 1 : -1));

  return (
    <Drawer open={project !== null} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent>
        <Celebration trigger={celebrate} />
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{CATEGORY_LABEL[project.category] ?? project.category}</p>
          <DrawerTitle className="mt-1 font-display text-lg font-bold">{project.name}</DrawerTitle>

          <div className="mt-6">
            <p className="text-sm font-bold">Jalons</p>
            <div className="mt-3 flex flex-col gap-2">
              {project.milestones
                .sort((a, b) => a.order - b.order)
                .map((milestone) => (
                  <label key={milestone.order} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={milestone.done}
                      disabled={isPending}
                      onChange={(e) => handleToggle(milestone.order, e.target.checked)}
                      className="size-4"
                    />
                    <span className={cn(milestone.done && "text-muted-foreground line-through")}>{milestone.title}</span>
                  </label>
                ))}
            </div>
          </div>

          {linkedTodos.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-bold">Tâches liées</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {linkedTodos.map((todo) => (
                  <p key={todo.id} className={cn("text-sm", todo.done && "text-muted-foreground line-through")}>
                    {todo.label}
                  </p>
                ))}
              </div>
            </div>
          )}

          {completedMilestones.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-bold">Historique</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {completedMilestones.map((milestone) => (
                  <div key={milestone.order} className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{milestone.title}</span>
                    <span>{formatDate(milestone.doneAt!)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
