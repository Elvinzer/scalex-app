"use client";

import { Check, GripVertical, Lightbulb, Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AdminIdea, AdminIdeaError, AdminIdeaStatus } from "@/lib/admin/ideas";

import { createAdminIdea, moveAdminIdea } from "./actions";

const ideaStatuses = ["backlog", "in_progress", "completed"] as const satisfies readonly AdminIdeaStatus[];
const inputClass =
  "min-h-11 w-full rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

export type AdminIdeasCopy = {
  boardTitle: string;
  boardHelp: string;
  add: string;
  ideaCount: { zero: string; one: string; other: string };
  columns: Record<AdminIdeaStatus, { title: string; description: string }>;
  empty: Record<AdminIdeaStatus, string>;
  form: {
    title: string;
    titleLabel: string;
    titlePlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    cancel: string;
    create: string;
    creating: string;
  };
  card: { createdAt: string; dragHint: string; moveTo: string };
  saving: string;
  errors: Record<AdminIdeaError, string>;
};

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value));
}

function errorMessage(error: AdminIdeaError | null, copy: AdminIdeasCopy) {
  return error ? copy.errors[error] : null;
}

function IdeaCard({
  idea,
  onMove,
  copy,
  locale,
}: {
  idea: AdminIdea;
  onMove: (ideaId: string, status: AdminIdeaStatus) => void;
  copy: AdminIdeasCopy;
  locale: string;
}) {
  return (
    <article
      draggable
      tabIndex={0}
      aria-label={`${idea.title}. ${copy.card.dragHint}`}
      data-testid={`admin-idea-${idea.id}`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-minaly-admin-idea", idea.id);
      }}
      className="group rounded-[var(--radius-control)] border border-border bg-card p-4 shadow-sm transition duration-[var(--motion-fast)] hover:-translate-y-px hover:border-border-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text" aria-hidden="true">
          {idea.status === "completed" ? <Check className="size-4" /> : <Lightbulb className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-bold leading-5">{idea.title}</h3>
          {idea.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{idea.description}</p>}
        </div>
        <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground opacity-60" aria-hidden="true" />
      </div>
      <div className="mt-4 flex flex-col gap-2 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">{copy.card.createdAt.replace("{date}", formatDate(idea.createdAt, locale))}</p>
        <label className="flex min-h-11 items-center gap-2 text-xs font-bold text-muted-foreground">
          <span className="sr-only">{copy.card.moveTo.replace("{status}", copy.columns[idea.status].title)}</span>
          <select
            aria-label={copy.card.moveTo.replace("{status}", copy.columns[idea.status].title)}
            value={idea.status}
            onChange={(event) => {
              const nextStatus = ideaStatuses.find((status) => status === event.target.value);
              if (nextStatus) onMove(idea.id, nextStatus);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-background px-2 text-xs font-bold text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            {ideaStatuses.map((status) => (
              <option key={status} value={status}>
                {copy.columns[status].title}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

function IdeaColumn({
  status,
  ideas,
  onDrop,
  onMove,
  copy,
  locale,
}: {
  status: AdminIdeaStatus;
  ideas: AdminIdea[];
  onDrop: (ideaId: string, status: AdminIdeaStatus) => void;
  onMove: (ideaId: string, status: AdminIdeaStatus) => void;
  copy: AdminIdeasCopy;
  locale: string;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <section
      data-testid={`admin-ideas-column-${status}`}
      aria-labelledby={`admin-ideas-${status}-title`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        const ideaId = event.dataTransfer.getData("application/x-minaly-admin-idea");
        if (ideaId) onDrop(ideaId, status);
      }}
      className={`flex min-h-72 flex-col rounded-[var(--radius-card)] border bg-muted/30 p-3 transition-colors duration-[var(--motion-fast)] ${isOver ? "border-accent bg-accent/5" : "border-border"}`}
    >
      <div className="border-b border-border pb-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`admin-ideas-${status}-title`} className="text-sm font-bold">
            {copy.columns[status].title}
          </h2>
          <span className="rounded-full bg-background px-2.5 py-1 text-xs font-bold tabular-nums text-muted-foreground">{ideas.length}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{copy.columns[status].description}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 pt-3">
        {ideas.length > 0 ? (
          ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} onMove={onMove} copy={copy} locale={locale} />)
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">{copy.empty[status]}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminIdeasBoard({ initialIdeas, copy, locale }: { initialIdeas: AdminIdea[]; copy: AdminIdeasCopy; locale: string }) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateIdeaLocally(ideaId: string, status: AdminIdeaStatus) {
    setIdeas((current) => {
      const idea = current.find((item) => item.id === ideaId);
      if (!idea || idea.status === status) return current;
      const nextPosition = current
        .filter((item) => item.status === status)
        .reduce((highest, item) => Math.max(highest, item.position), -1) + 1;

      return current.map((item) =>
        item.id === ideaId ? { ...item, status, position: nextPosition, updatedAt: new Date().toISOString() } : item
      );
    });
  }

  function persistMove(ideaId: string, status: AdminIdeaStatus) {
    const previous = ideas;
    const idea = ideas.find((item) => item.id === ideaId);
    if (!idea || idea.status === status) return;

    setError(null);
    updateIdeaLocally(ideaId, status);
    startTransition(async () => {
      const result = await moveAdminIdea({ id: ideaId, status });
      if (result.error) {
        setIdeas(previous);
        setError(errorMessage(result.error, copy));
      }
    });
  }

  function submitIdea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) return;

    setError(null);
    startTransition(async () => {
      const result = await createAdminIdea(form);
      if (result.error || !result.idea) {
        setError(errorMessage(result.error, copy));
        return;
      }

      const createdIdea = result.idea;
      if (!createdIdea) return;
      setIdeas((current) => [...current, createdIdea]);
      setForm({ title: "", description: "" });
      setDialogOpen(false);
    });
  }

  const groupedIdeas = ideaStatuses.reduce<Record<AdminIdeaStatus, AdminIdea[]>>(
    (groups, status) => {
      groups[status] = ideas.filter((idea) => idea.status === status).sort((a, b) => a.position - b.position);
      return groups;
    },
    { backlog: [], in_progress: [], completed: [] }
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="sticker-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text" aria-hidden="true">
            <Sparkles className="size-5" />
          </div>
          <div>
          <h2 className="text-sm font-bold">{copy.boardTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{copy.boardHelp}</p>
          </div>
        </div>
        <Button type="button" onClick={() => { setError(null); setDialogOpen(true); }} className="min-h-11 shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          {copy.add}
        </Button>
      </section>

      {error && <p role="alert" className="rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-4 py-3 text-sm font-bold text-state-critical">{error}</p>}
      {isPending && <p aria-live="polite" className="text-sm text-muted-foreground">{copy.saving}</p>}

      <section aria-label={copy.boardTitle} className="grid gap-3 lg:grid-cols-3">
        {ideaStatuses.map((status) => (
          <IdeaColumn key={status} status={status} ideas={groupedIdeas[status]} onDrop={persistMove} onMove={persistMove} copy={copy} locale={locale} />
        ))}
      </section>

      <p className="text-sm text-muted-foreground">
        {(ideas.length === 0 ? copy.ideaCount.zero : ideas.length === 1 ? copy.ideaCount.one : copy.ideaCount.other).replace("{count}", String(ideas.length))}
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submitIdea} className="flex flex-col gap-4">
            <DialogTitle className="text-xl font-bold">{copy.form.title}</DialogTitle>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              {copy.form.titleLabel}
              <input
                required
                maxLength={160}
                autoFocus
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder={copy.form.titlePlaceholder}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-bold">
              {copy.form.descriptionLabel}
              <textarea
                maxLength={2000}
                rows={4}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder={copy.form.descriptionPlaceholder}
                className={`${inputClass} py-3`}
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={isPending} onClick={() => setDialogOpen(false)}>
                {copy.form.cancel}
              </Button>
              <Button type="submit" disabled={isPending || !form.title.trim()}>
                {isPending ? copy.form.creating : copy.form.create}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
