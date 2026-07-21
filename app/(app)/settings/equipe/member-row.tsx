"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import { removeMember, updateMemberRoles } from "./actions";

type RoleOption = { id: string; name: string };
type Member = {
  id: string;
  email: string;
  status: string;
  roles: RoleOption[];
};

export function MemberRow({ member, roles, statusLabel }: { member: Member; roles: RoleOption[]; statusLabel: string }) {
  const [open, setOpen] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(member.roles.map((role) => role.id));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleRole(roleId: string) {
    setSelectedRoleIds((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]
    );
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRoles(member.id, selectedRoleIds);
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  function handleRemove() {
    if (!confirm(`Retirer ${member.email} de l'équipe ?`)) return;
    startTransition(async () => {
      await removeMember(member.id);
    });
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-bold">{member.email}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {member.roles.length === 0 && <span className="text-muted-foreground">—</span>}
          {member.roles.map((role) => (
            <span key={role.id} className="rounded-full bg-signal/15 px-2.5 py-1 text-xs font-bold text-signal">
              {role.name}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{statusLabel}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                Rôles
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle className="text-lg font-bold">Rôles de {member.email}</DialogTitle>
              <div className="mt-4 flex flex-wrap gap-2">
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
              {error && <p className="mt-3 text-sm text-state-critical">{error}</p>}
              <Button type="button" disabled={isPending} onClick={handleSave} className="mt-4 self-start">
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogContent>
          </Dialog>
          <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={handleRemove}>
            Retirer
          </Button>
        </div>
      </td>
    </tr>
  );
}
