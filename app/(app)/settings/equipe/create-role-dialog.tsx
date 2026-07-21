"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PermissionKey } from "@/lib/team/permissions";

import { createRole } from "./actions";

export function CreateRoleDialog({
  permissionOptions,
  trigger,
}: {
  permissionOptions: { key: PermissionKey; label: string }[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PermissionKey[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PermissionKey) {
    setSelected((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = { name: String(formData.get("name") ?? ""), permissions: selected };

    startTransition(async () => {
      const result = await createRole(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setSelected([]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Nouveau rôle</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Nom du rôle</span>
            <input
              type="text"
              name="name"
              required
              placeholder="Assistant"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Accès</span>
            <div className="flex flex-wrap gap-2">
              {permissionOptions.map((option) => {
                const active = selected.includes(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggle(option.key)}
                    className={
                      active
                        ? "rounded-full border border-signal bg-signal/15 px-3 py-1.5 text-sm font-bold text-signal"
                        : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-signal/50"
                    }
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending} className="self-start">
            {isPending ? "Création..." : "Créer le rôle"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
