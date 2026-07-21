"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { PermissionKey } from "@/lib/team/permissions";

import { deleteRole, updateRolePermissions } from "./actions";

type Role = { id: string; name: string; permissions: string[]; isDefault: boolean };

export function RoleCard({
  role,
  permissionOptions,
}: {
  role: Role;
  permissionOptions: { key: PermissionKey; label: string }[];
}) {
  const [permissions, setPermissions] = useState<string[]>(role.permissions);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(key: PermissionKey) {
    const next = permissions.includes(key) ? permissions.filter((p) => p !== key) : [...permissions, key];
    setPermissions(next);
    setError(null);
    startTransition(async () => {
      const result = await updateRolePermissions(role.id, next);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!confirm(`Supprimer le rôle "${role.name}" ?`)) return;
    startTransition(async () => {
      await deleteRole(role.id);
    });
  }

  return (
    <div className="sticker-card p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-bold">{role.name}</p>
        {!role.isDefault && (
          <Button type="button" variant="destructive" size="sm" disabled={isPending} onClick={handleDelete}>
            Supprimer
          </Button>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {permissionOptions.map((option) => {
          const active = permissions.includes(option.key);
          return (
            <button
              key={option.key}
              type="button"
              disabled={isPending}
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
      {error && <p className="mt-3 text-sm text-state-critical">{error}</p>}
    </div>
  );
}
