import { getAccountContext, requireOwner, requirePermission } from "@/lib/team/context";

import type { PermissionKey } from "@/lib/team/permissions";

export type CrmAccess = {
  userId: string;
  accountId: string;
  isOwner: boolean;
  permissions: "all" | ReadonlySet<string>;
};

export async function requireCrmAccess(userId: string, permission: PermissionKey = "crm:view"): Promise<CrmAccess | null> {
  const context = await getAccountContext(userId);
  if (!context || !context.crmEnabled) return null;
  if (context.isOwner) return { userId, accountId: context.accountId, isOwner: true, permissions: "all" };
  if (!context.permissions.has(permission)) return null;
  return { userId, accountId: context.accountId, isOwner: false, permissions: context.permissions };
}

export async function requireCrmOwner(userId: string): Promise<{ userId: string; accountId: string } | null> {
  const access = await requireOwner(userId);
  return access ? { userId, accountId: access.accountId } : null;
}

export function hasCrmPermission(access: CrmAccess, permission: PermissionKey): boolean {
  return access.isOwner || access.permissions === "all" || access.permissions.has(permission);
}

export async function getCrmPermissionContext(userId: string): Promise<CrmAccess | null> {
  return requireCrmAccess(userId, "crm:view");
}

export async function requireCrmPermission(userId: string, permission: PermissionKey): Promise<CrmAccess | null> {
  return requireCrmAccess(userId, permission);
}

export async function requireCrmViewTeam(userId: string): Promise<CrmAccess | null> {
  return requirePermission(userId, "crm:view-team").then(async (permission) => {
    if (!permission) return null;
    return requireCrmAccess(userId, "crm:view-team");
  });
}
