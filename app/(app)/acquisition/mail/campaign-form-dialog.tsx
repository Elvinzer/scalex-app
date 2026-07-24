"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { EmailCampaignRow } from "@/lib/email-campaigns/types";

import { saveEmailCampaign } from "./actions";

const COUNT_FIELDS = [
  { name: "opens", label: "Ouvertures" },
  { name: "clicks", label: "Clics" },
  { name: "revenueAttributed", label: "CA attribué (€)" },
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CampaignFormDialog({ campaign, trigger }: { campaign?: EmailCampaignRow; trigger: React.ReactNode }) {
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
      name: String(formData.get("name") ?? ""),
      sentAt: String(formData.get("sentAt") ?? today()),
      subject: String(formData.get("subject") ?? "") || null,
      sends: Number(formData.get("sends") ?? 0),
      opens: numberOrNull("opens"),
      clicks: numberOrNull("clicks"),
      revenueAttributed: numberOrNull("revenueAttributed"),
    };

    startTransition(async () => {
      const result = await saveEmailCampaign(campaign?.id ?? null, data);
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
          {campaign ? "Modifier l'envoi" : "Ajouter un envoi"}
        </DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Nom de l&apos;envoi</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={campaign?.name ?? ""}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Date d&apos;envoi</span>
              <input
                type="date"
                name="sentAt"
                required
                defaultValue={campaign?.sentAt ?? today()}
                className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Sujet (optionnel)</span>
            <input
              type="text"
              name="subject"
              defaultValue={campaign?.subject ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Envois</span>
            <input
              type="number"
              name="sends"
              min={0}
              required
              defaultValue={campaign?.sends ?? ""}
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

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
            {isPending ? "Enregistrement..." : campaign ? "Enregistrer" : "Ajouter l'envoi"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
