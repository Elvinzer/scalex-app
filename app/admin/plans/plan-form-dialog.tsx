"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { savePlan } from "./actions";

type PlanRow = {
  id: string;
  key: string;
  name: string;
  priceMonthlyCents: number;
  isActive: boolean;
  features: unknown;
};

export function PlanFormDialog({ plan, trigger }: { plan?: PlanRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const features = (plan?.features ?? {}) as { teamMembersEnabled?: boolean; maxTeamMembers?: number | null };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const maxTeamMembersRaw = formData.get("maxTeamMembers");
    const data = {
      key: String(formData.get("key") ?? ""),
      name: String(formData.get("name") ?? ""),
      priceMonthlyCents: Math.round(Number(formData.get("priceMonthly") ?? "0") * 100),
      teamMembersEnabled: formData.get("teamMembersEnabled") === "on",
      maxTeamMembers:
        maxTeamMembersRaw === "" || maxTeamMembersRaw === null ? null : Number(maxTeamMembersRaw),
      isActive: formData.get("isActive") === "on",
    };

    startTransition(async () => {
      const result = await savePlan(plan?.id ?? null, data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">{plan ? "Modifier le plan" : "Nouveau plan"}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Clé (slug)</span>
              <input
                type="text"
                name="key"
                required
                defaultValue={plan?.key ?? ""}
                placeholder="growth"
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Nom</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={plan?.name ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Prix mensuel (USD)</span>
            <input
              type="number"
              name="priceMonthly"
              min={0}
              step="0.01"
              required
              defaultValue={plan ? plan.priceMonthlyCents / 100 : ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="teamMembersEnabled" defaultChecked={features.teamMembersEnabled ?? false} />
            <span>Inclut les membres d&apos;équipe</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Nombre max de membres (vide = illimité)</span>
            <input
              type="number"
              name="maxTeamMembers"
              min={1}
              defaultValue={features.maxTeamMembers ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} />
            <span>Actif (visible pour les infopreneurs)</span>
          </label>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : plan ? "Enregistrer" : "Créer le plan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
