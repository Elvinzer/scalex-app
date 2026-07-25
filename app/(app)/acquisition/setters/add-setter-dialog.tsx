"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { saveSetter } from "./actions";

export function AddSetterDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    const data = {
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? "") || null,
      defaultCommissionPct: (Number(formData.get("defaultCommissionPct") ?? 10) || 10) / 100,
    };

    startTransition(async () => {
      const result = await saveSetter(null, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Plus className="size-4" />
          Ajouter un setter
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Ajouter un setter</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Nom</span>
            <input
              type="text"
              name="name"
              required
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Email (optionnel)</span>
            <input
              type="email"
              name="email"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">% de commission par défaut</span>
            <input
              type="number"
              name="defaultCommissionPct"
              min={0}
              max={100}
              defaultValue={10}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : "Ajouter le setter"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
