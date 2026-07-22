"use client";

import { useEffect, useRef, useState } from "react";

import { NewProjectDialog } from "./new-project-dialog";
import { ProjectDrawer } from "./project-drawer";

type Milestone = { order: number; title: string; done: boolean; doneAt: string | null };
type Project = { id: string; name: string; category: string; deadline: string | null; milestones: Milestone[]; status: string };
type Todo = { id: string; label: string; done: boolean; projectId: string | null };

const CATEGORY_LABEL: Record<string, string> = {
  acquisition: "Acquisition",
  vente: "Vente",
  delivrabilite: "Délivrabilité",
  autre: "Autre",
};

const MAX_VISIBLE = 4;

function ProgressBar({ percent }: { percent: number }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${percent / 100})`;
    });
    return () => cancelAnimationFrame(frame);
  }, [percent]);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        ref={barRef}
        className="h-full origin-left rounded-full bg-positive transition-transform duration-[var(--motion-slow)] ease-[var(--ease-out)]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

function formatDeadline(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
}

function ProjectRow({ project, onClick }: { project: Project; onClick: () => void }) {
  const total = project.milestones.length;
  const completed = project.milestones.filter((m) => m.done).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <button type="button" onClick={onClick} className="flex w-full flex-col gap-2 rounded-[10px] p-2.5 text-left hover:bg-muted">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-bold">{project.name}</span>
        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-text">
          {CATEGORY_LABEL[project.category] ?? project.category}
        </span>
      </div>
      <ProgressBar percent={percent} />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {completed}/{total} jalons
        </span>
        {project.deadline && <span>Échéance : {formatDeadline(project.deadline)}</span>}
      </div>
    </button>
  );
}

export function ProjectPanel({ projects, todos }: { projects: Project[]; todos: Todo[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const active = projects.filter((p) => p.status !== "done");
  const done = projects.filter((p) => p.status === "done");
  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const linkedTodos = selected ? todos.filter((t) => t.projectId === selected.id) : [];

  return (
    <div className="sticker-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Projets en cours</h2>
        <NewProjectDialog />
      </div>

      {active.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Aucun projet actif pour l&apos;instant.</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {(showAllActive ? active : active.slice(0, MAX_VISIBLE)).map((project) => (
            <ProjectRow key={project.id} project={project} onClick={() => setSelectedId(project.id)} />
          ))}
        </div>
      )}

      {active.length > MAX_VISIBLE && (
        <button type="button" onClick={() => setShowAllActive((v) => !v)} className="mt-2 text-xs font-bold text-muted-foreground hover:underline">
          {showAllActive ? "Réduire" : `Tout voir (${active.length})`}
        </button>
      )}

      {done.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs font-bold text-muted-foreground hover:underline">
            Terminés ({done.length})
          </button>
          {showDone && (
            <div className="mt-2 flex flex-col divide-y divide-border">
              {done.map((project) => (
                <ProjectRow key={project.id} project={project} onClick={() => setSelectedId(project.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      <ProjectDrawer project={selected} linkedTodos={linkedTodos} onClose={() => setSelectedId(null)} />
    </div>
  );
}
