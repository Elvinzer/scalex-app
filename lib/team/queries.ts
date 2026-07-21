import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { teamMemberRoles, teamMembers, teamRoles } from "@/db/schema";

export async function getRoles(accountId: string) {
  return db.select().from(teamRoles).where(eq(teamRoles.accountId, accountId)).orderBy(teamRoles.createdAt);
}

export async function getTeamMembers(accountId: string) {
  const members = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.accountId, accountId))
    .orderBy(teamMembers.invitedAt);

  const roleRows = await db
    .select({ teamMemberId: teamMemberRoles.teamMemberId, role: teamRoles })
    .from(teamMemberRoles)
    .innerJoin(teamRoles, eq(teamMemberRoles.roleId, teamRoles.id))
    .where(eq(teamRoles.accountId, accountId));

  return members
    .filter((member) => member.status !== "removed")
    .map((member) => ({
      ...member,
      roles: roleRows.filter((row) => row.teamMemberId === member.id).map((row) => row.role),
    }));
}

export async function getInviteByToken(token: string) {
  const [invite] = await db
    .select()
    .from(teamMembers)
    .where(and(eq(teamMembers.inviteToken, token), eq(teamMembers.status, "invited"), gt(teamMembers.inviteExpiresAt, new Date())))
    .limit(1);
  return invite ?? null;
}
