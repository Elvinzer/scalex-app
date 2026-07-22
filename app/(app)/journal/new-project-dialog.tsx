"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { createProject } from "./actions";

const CATEGORY_OPTIONS: { value: "acquisition" | "vente" | "delivrabilite" | "autre"; label: string }[] = [
  { value: "acquisition", label: "Acquisition" },
  { value: "vente", label: "Vente" },
  { value: "delivrabilite", label: "Délivrabilité" },
  { value: "autre", label: "Autre" },
];

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORY_OPTIONS)[number]["value"]>("acquisition");
  const [deadline, setDeadline] = useState("");
  const [milestones, setMilestones] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateMilestone(index: number, value: string) {
    setMilestones((prev) => prev.map((m, i) => (i === index ? value : m)));
  }
  function addMilestone() {
    setMilestones((prev) => [...prev, ""]);
  }
  function removeMilestone(index: number) {
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }
  function moveMilestone(index: number, direction: -1 | 1) {
    setMilestones((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function resetAndClose() {
    setName("");
    setDescription("");
    setCategory("acquisition");
    setDeadline("");
    setMilestones([""]);
    setError(null);
    setOpen(false);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const milestoneTitles = milestones.map((m) => m.trim()).filter(Boolean);
    if (!name.trim() || milestoneTitles.length === 0) {
      setError("Un nom et au moins un jalon sont requis.");
      return;
    }
    startTransition(async () => {
      const result = await createProject({
        name: name.trim(),
        description: description.trim(),
        category,
        deadline: deadline || null,
        milestoneTitles,
      });
      if (result.error) setError(result.error);
      else resetAndClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          + Nouveau projet
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Nouveau projet</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Nom</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Description courte</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Catégorie</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Échéance (optionnel)</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
              />
            </label>
          </div>

          <div>
            <span className="text-sm font-bold">Jalons</span>
            <div className="mt-2 flex flex-col gap-2">
              {milestones.map((milestone, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <input
                    value={milestone}
                    onChange={(e) => updateMilestone(index, e.target.value)}
                    placeholder={`Jalon ${index + 1}`}
                    className="flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent"
                  />
                  <button type="button" onClick={() => moveMilestone(index, -1)} disabled={index === 0} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => moveMilestone(index, 1)} disabled={index === milestones.length - 1} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => removeMilestone(index)} disabled={milestones.length === 1} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addMilestone} className="mt-2">
              + Ajouter un jalon
            </Button>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Création..." : "Créer le projet"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
