"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { inviteMember } from "./actions";

type RoleOption = { id: string; name: string };

export function InviteMemberDialog({ roles, trigger }: { roles: RoleOption[]; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggleRole(roleId: string) {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);

    const data = { email: String(formData.get("email") ?? ""), roleIds: selectedRoleIds };

    startTransition(async () => {
      const result = await inviteMember(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setSelectedRoleIds([]);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-lg font-bold">Inviter un membre</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="prenom@email.com"
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Rôles</span>
            <div className="flex flex-wrap gap-2">
              {roles.map((role) => {
                const active = selectedRoleIds.includes(role.id);
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => toggleRole(role.id)}
                    className={
                      active
                        ? "rounded-full border border-signal bg-signal/15 px-3 py-1.5 text-sm font-bold text-signal"
                        : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-signal/50"
                    }
                  >
                    {role.name}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-state-critical">{error}</p>}

          <Button type="submit" disabled={isPending || selectedRoleIds.length === 0} className="self-start">
            {isPending ? "Envoi..." : "Envoyer l'invitation"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
