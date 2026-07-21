import { db } from "@/db";
import { teamRoles } from "@/db/schema";
import { DEFAULT_ROLES } from "@/lib/team/permissions";

// Idempotent — onConflictDoNothing on (accountId, key) means calling this on
// every /settings/equipe or /settings/roles visit is cheap and safe; only
// the very first visit actually inserts rows. An owner's later edits to a
// role's permissions are never overwritten by a re-seed.
export async function ensureDefaultRoles(accountId: string): Promise<void> {
  await db
    .insert(teamRoles)
    .values(
      DEFAULT_ROLES.map((role) => ({
        accountId,
        key: role.key,
        name: role.name,
        permissions: role.permissions,
        isDefault: true,
      }))
    )
    .onConflictDoNothing({ target: [teamRoles.accountId, teamRoles.key] });
}
