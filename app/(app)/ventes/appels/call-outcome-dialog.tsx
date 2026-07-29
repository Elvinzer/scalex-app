"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SalesCallRow } from "@/lib/iclosed/calls";

import { setCallOutcome } from "./actions";

type Result = "no_show" | "not_closed" | "closed";

const RESULTS: { value: Result; label: string; selectedClass: string }[] = [
  { value: "no_show", label: "No-show", selectedClass: "border-state-caution bg-state-caution/10 text-state-caution" },
  { value: "not_closed", label: "Non closé", selectedClass: "border-state-unknown bg-state-unknown-bg text-state-unknown" },
  { value: "closed", label: "Closé", selectedClass: "border-state-healthy bg-state-healthy-bg text-state-healthy" },
];

function deriveResult(call: SalesCallRow): Result | null {
  if (call.attendance === "no_show") return "no_show";
  if (call.outcome === "closed") return "closed";
  if (call.outcome === "not_closed") return "not_closed";
  return null;
}

export function CallOutcomeDialog({ call, trigger }: { call: SalesCallRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(deriveResult(call));
  const [contracted, setContracted] = useState(call.contracted !== null ? String(call.contracted) : "");
  const [collected, setCollected] = useState(call.collected !== null ? String(call.collected) : "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!result) {
      setError("Choisis une issue.");
      return;
    }
    const input =
      result === "closed"
        ? {
            callId: call.id,
            result,
            contracted: Number.parseInt(contracted || "0", 10),
            collected: Number.parseInt(collected || "0", 10),
          }
        : { callId: call.id, result };

    startTransition(async () => {
      const res = await setCallOutcome(input);
      if (res.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle>Issue de l&apos;appel{call.inviteeName ? ` — ${call.inviteeName}` : ""}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {RESULTS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setResult(r.value)}
                className={`rounded-[var(--radius-control)] border px-3 py-2 text-sm font-bold transition-colors ${
                  result === r.value ? r.selectedClass : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {result === "closed" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Montant contracté (€)</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={contracted}
                  onChange={(e) => setContracted(e.target.value)}
                  required
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Montant collecté (€)</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={collected}
                  onChange={(e) => setCollected(e.target.value)}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
                <span className="text-xs text-muted-foreground">
                  Le reste (contracté − collecté) est enregistré comme paiement en attente dans le suivi des ventes.
                </span>
              </label>
            </div>
          )}

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
