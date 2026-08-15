export const SUPPORT_STAFF_PERMISSION = "support:tickets" as const;
export type SupportStaffPermission = typeof SUPPORT_STAFF_PERMISSION;

export function hasSupportStaffPermission(
  permissions: ReadonlySet<SupportStaffPermission>,
  permission: SupportStaffPermission
): boolean {
  return permissions.has(permission);
}

