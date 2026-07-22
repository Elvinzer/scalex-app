"use client";

import { MoreHorizontal } from "lucide-react";
import { useMemo, useState, useTransition, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { createTodo, deleteTodo, toggleTodo, updateTodo } from "./actions";

type Todo = {
  id: string;
  label: string;
  dueDate: string | null;
  done: boolean;
  projectId: string | null;
  isBusinessImprovement: boolean;
};

const MAX_VISIBLE = 8;
const todayIso = () => new Date().toISOString().slice(0, 10);

function TodoMenu({ todo, projects }: { todo: Todo; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(todo.label);
  const [dueDate, setDueDate] = useState(todo.dueDate ?? "");
  const [projectId, setProjectId] = useState(todo.projectId ?? "");
  const [isBusinessImprovement, setIsBusinessImprovement] = useState(todo.isBusinessImprovement);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await updateTodo({
        id: todo.id,
        label: label.trim() || todo.label,
        dueDate: dueDate || null,
        projectId: projectId || null,
        isBusinessImprovement,
      });
      setOpen(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTodo(todo.id);
      setOpen(false);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Options">
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-3 p-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
        />
        <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
          Échéance
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-muted-foreground">
          Lier à un projet
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
          >
            <option value="">Aucun</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={isBusinessImprovement} onChange={(e) => setIsBusinessImprovement(e.target.checked)} className="size-3.5" />
          Amélioration business
        </label>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={isPending} className="flex-1">
            Enregistrer
          </Button>
          <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isPending}>
            Supprimer
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TodoRow({ todo, projects }: { todo: Todo; projects: { id: string; name: string }[] }) {
  const [isPending, startTransition] = useTransition();
  const overdue = todo.dueDate !== null && !todo.done && todo.dueDate < todayIso();

  function handleToggle() {
    startTransition(async () => {
      await toggleTodo(todo.id, !todo.done);
    });
  }

  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={todo.done ? "Marquer comme à faire" : "Marquer comme terminée"}
        className={cn(
          "flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)]",
          todo.done ? "border-accent bg-accent text-white" : "border-border"
        )}
      >
        {todo.done && "✓"}
      </button>
      <span className={cn("flex-1 truncate text-sm", todo.done && "text-muted-foreground line-through")}>{todo.label}</span>
      {todo.dueDate && !todo.done && (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", overdue ? "bg-negative/15 text-negative" : "bg-muted text-muted-foreground")}>
          {todo.dueDate.slice(5)}
        </span>
      )}
      <TodoMenu todo={todo} projects={projects} />
    </div>
  );
}

export function TodoPanel({ todos, projects }: { todos: Todo[]; projects: { id: string; name: string }[] }) {
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showAllDone, setShowAllDone] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);

  const { pending, done } = useMemo(() => {
    const pendingTodos = todos
      .filter((t) => !t.done)
      .sort((a, b) => {
        const rank = (t: Todo) => (t.dueDate === null ? 2 : t.dueDate < todayIso() ? 0 : t.dueDate === todayIso() ? 0.5 : 1);
        return rank(a) - rank(b) || (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
      });
    const doneTodos = todos.filter((t) => t.done);
    return { pending: pendingTodos, done: doneTodos };
  }, [todos]);

  function handleAdd(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !draft.trim()) return;
    const label = draft.trim();
    setDraft("");
    startTransition(async () => {
      await createTodo(label);
    });
  }

  return (
    <div className="sticker-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-base font-bold">À faire</p>
        <span className="text-xs font-bold text-muted-foreground">
          {todos.filter((t) => t.done).length}/{todos.length}
        </span>
      </div>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleAdd}
        disabled={isPending}
        placeholder="+ Ajouter une tâche"
        className="mb-3 w-full rounded-[var(--radius-control)] border border-dashed border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
      />

      <div className="flex flex-col divide-y divide-border">
        {(showAllPending ? pending : pending.slice(0, MAX_VISIBLE)).map((todo) => (
          <TodoRow key={todo.id} todo={todo} projects={projects} />
        ))}
      </div>

      {pending.length > MAX_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAllPending((v) => !v)}
          className="mt-2 text-xs font-bold text-muted-foreground hover:underline"
        >
          {showAllPending ? "Réduire" : `Tout voir (${pending.length})`}
        </button>
      )}

      {done.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button type="button" onClick={() => setShowAllDone((v) => !v)} className="text-xs font-bold text-muted-foreground hover:underline">
            Terminées ({done.length})
          </button>
          {showAllDone && (
            <div className="mt-2 flex flex-col divide-y divide-border">
              {done.map((todo) => (
                <TodoRow key={todo.id} todo={todo} projects={projects} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
