import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { staffMembers, users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { isAdminEmail } from "@/lib/admin";
import type { SupportStaffRole } from "@/lib/support/types";
import { hasSupportStaffPermission } from "@/lib/staff/permission-rules";

export const STAFF_PERMISSION_KEYS = ["support:tickets"] as const;
export type StaffPermissionKey = (typeof STAFF_PERMISSION_KEYS)[number];

export type StaffContext = {
  isFounder: boolean;
  staffMemberId: string | null;
  role: SupportStaffRole | null;
  permissions: ReadonlySet<StaffPermissionKey>;
};

const SUPPORT_PERMISSIONS = new Set<StaffPermissionKey>(["support:tickets"]);

export function hasStaffPermission(
  context: Pick<StaffContext, "permissions">,
  permission: StaffPermissionKey
): boolean {
  return hasSupportStaffPermission(context.permissions, permission);
}

export async function getStaffContext(userId: string, email?: string | null): Promise<StaffContext> {
  const resolvedEmail = email ?? (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.email;
  if (resolvedEmail && isAdminEmail(resolvedEmail)) {
    return { isFounder: true, staffMemberId: null, role: "support_manager", permissions: SUPPORT_PERMISSIONS };
  }

  const [staff] = await db
    .select({ id: staffMembers.id, role: staffMembers.role })
    .from(staffMembers)
    .where(and(eq(staffMembers.userId, userId), eq(staffMembers.status, "active")))
    .limit(1);

  if (!staff) {
    return { isFounder: false, staffMemberId: null, role: null, permissions: new Set() };
  }

  return {
    isFounder: false,
    staffMemberId: staff.id,
    role: staff.role,
    permissions: SUPPORT_PERMISSIONS,
  };
}

export async function requireStaffPermission(permission: StaffPermissionKey = "support:tickets") {
  const identity = await getAuthIdentity();
  if (!identity) throw new Error("Accès refusé.");
  const context = await getStaffContext(identity.userId, identity.email);
  if (!hasStaffPermission(context, permission)) throw new Error("Accès refusé.");
  return { ...identity, ...context };
}
