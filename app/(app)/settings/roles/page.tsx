import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";
import { ensureDefaultRoles } from "@/lib/team/roles";
import { getRoles } from "@/lib/team/queries";
import { PERMISSION_KEYS, PERMISSION_LABELS } from "@/lib/team/permissions";

import { CreateRoleDialog } from "./create-role-dialog";
import { RoleCard } from "./role-card";

const PERMISSION_OPTIONS = PERMISSION_KEYS.map((key) => ({ key, label: PERMISSION_LABELS[key] }));

export default async function RolesPage() {
  const userId = await requireUserId();
  const access = await requireOwnerOrRedirect(userId);

  await ensureDefaultRoles(access.accountId);
  const roles = await getRoles(access.accountId);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Rôles &amp; permissions</h1>
          <p className="mt-1 text-muted-foreground">
            Ce que chaque rôle peut voir et éditer. Change-le à tout moment — ça s&apos;applique
            immédiatement à tous les membres qui l&apos;ont.
          </p>
        </div>
        <CreateRoleDialog
          permissionOptions={PERMISSION_OPTIONS}
          trigger={
            <Button type="button">
              <Plus className="size-4" />
              Nouveau rôle
            </Button>
          }
        />
      </div>

      <div className="flex flex-col gap-4">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={{ id: role.id, name: role.name, permissions: role.permissions as string[], isDefault: role.isDefault }}
            permissionOptions={PERMISSION_OPTIONS}
          />
        ))}
      </div>
    </div>
  );
}
