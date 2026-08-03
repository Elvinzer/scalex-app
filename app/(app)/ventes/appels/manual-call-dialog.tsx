"use client";

import { Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SetterRow } from "@/lib/setters/types";

import { createManualCallAction } from "./actions";

const ATTENDANCE_OPTIONS = [
  { value: "showed", label: "Honoré" },
  { value: "no_show", label: "No-show" },
  { value: "booked", label: "Réservé (à venir)" },
  { value: "cancelled", label: "Annulé" },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// For accounts without iClosed/Calendly connected — or to log an
// off-platform call even when one is — a plain form that creates the
// booking itself (source: "manual"). Outcome (closé/non closé/attente
// décision) and amounts are set afterwards through the exact same inline
// controls as any synced call (calls-table.tsx), never duplicated here.
export function ManualCallDialog({ setters }: { setters: SetterRow[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);

    const data = {
      inviteeName: String(formData.get("inviteeName") ?? ""),
      inviteeEmail: String(formData.get("inviteeEmail") ?? "") || null,
      scheduledAt: String(formData.get("scheduledAt") ?? today()),
      closer: String(formData.get("closer") ?? "") || null,
      setterId: String(formData.get("setterId") ?? "") || null,
      attendance: String(formData.get("attendance") ?? "showed"),
    };

    startTransition(async () => {
      const result = await createManualCallAction(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      form.reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Plus className="size-4" />
          Ajouter un appel manuellement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Ajouter un appel manuellement</DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          Pas d&apos;iClosed ou Calendly ? Enregistre l&apos;appel toi-même — tu pourras marquer son issue juste après,
          comme pour un appel synchronisé.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Nom du prospect</span>
            <input
              type="text"
              name="inviteeName"
              required
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Email (optionnel)</span>
            <input
              type="email"
              name="inviteeEmail"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de l&apos;appel</span>
              <input
                type="date"
                name="scheduledAt"
                required
                max={today()}
                defaultValue={today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Issue</span>
              <select
                name="attendance"
                defaultValue="showed"
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                {ATTENDANCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Closer (optionnel)</span>
              <input
                type="text"
                name="closer"
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Setter (optionnel)</span>
              <select
                name="setterId"
                defaultValue=""
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              >
                <option value="">—</option>
                {setters.map((setter) => (
                  <option key={setter.id} value={setter.id}>
                    {setter.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : "Ajouter l'appel"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
