"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AdCampaignRow } from "@/lib/ad-campaigns/types";

import { saveAdCampaign } from "./actions";

const COUNT_FIELDS = [
  { name: "budget", label: "Budget (€)" },
  { name: "spend", label: "Dépensé (€)" },
  { name: "impressions", label: "Impressions" },
  { name: "clicks", label: "Clics" },
  { name: "leads", label: "Leads" },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CampaignFormDialog({ campaign, trigger }: { campaign?: AdCampaignRow; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const numberOrNull = (name: string) => {
      const raw = formData.get(name);
      return raw === "" || raw === null ? null : Number(raw);
    };

    const data = {
      platform: String(formData.get("platform") ?? ""),
      name: String(formData.get("name") ?? ""),
      objective: String(formData.get("objective") ?? "") || null,
      budget: numberOrNull("budget"),
      spend: numberOrNull("spend"),
      impressions: numberOrNull("impressions"),
      clicks: numberOrNull("clicks"),
      leads: numberOrNull("leads"),
      startDate: String(formData.get("startDate") ?? today()),
      endDate: String(formData.get("endDate") ?? "") || null,
    };

    startTransition(async () => {
      const result = await saveAdCampaign(campaign?.id ?? null, data);
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
        <DialogTitle className="text-lg font-bold">
          {campaign ? "Modifier la campagne" : "Ajouter une campagne"}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Plateforme</span>
              <input
                type="text"
                name="platform"
                required
                defaultValue={campaign?.platform ?? ""}
                placeholder="Meta, TikTok, Google..."
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Nom de la campagne</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={campaign?.name ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Objectif (optionnel)</span>
            <input
              type="text"
              name="objective"
              defaultValue={campaign?.objective ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de début</span>
              <input
                type="date"
                name="startDate"
                required
                defaultValue={campaign?.startDate ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date de fin (optionnel)</span>
              <input
                type="date"
                name="endDate"
                defaultValue={campaign?.endDate ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {COUNT_FIELDS.map((field) => (
              <label key={field.name} className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{field.label}</span>
                <input
                  type="number"
                  name={field.name}
                  min={0}
                  defaultValue={campaign?.[field.name] ?? ""}
                  className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                />
              </label>
            ))}
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Enregistrement..." : campaign ? "Enregistrer" : "Ajouter la campagne"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
