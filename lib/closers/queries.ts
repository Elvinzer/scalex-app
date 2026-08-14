import { and, asc, eq, ne } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { teamMemberRoles, teamMembers, teamRoles, users } from "@/db/schema";

import type { ActiveCloser, CloserRow } from "./types";

/**
 * The owner is always a closer. Other closers are active or invited team
 * members carrying the seeded `closing` role. Keeping this lookup in one
 * place makes every closer selector use the same source of truth.
 */
export const getClosers = cache(async (accountId: string): Promise<CloserRow[]> => {
  const [[owner], teamCloserRows] = await Promise.all([
    db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(eq(users.id, accountId))
      .limit(1),
    db
      .select({
        member: teamMembers,
        user: { id: users.id, displayName: users.displayName, email: users.email },
      })
      .from(teamMembers)
      .innerJoin(teamMemberRoles, eq(teamMemberRoles.teamMemberId, teamMembers.id))
      .innerJoin(
        teamRoles,
        and(
          eq(teamMemberRoles.roleId, teamRoles.id),
          eq(teamRoles.accountId, accountId),
          eq(teamRoles.key, "closing")
        )
      )
      .leftJoin(users, eq(teamMembers.memberUserId, users.id))
      .where(and(eq(teamMembers.accountId, accountId), ne(teamMembers.status, "removed")))
      .orderBy(asc(teamMembers.status), asc(users.displayName), asc(users.email), asc(teamMembers.email)),
  ]);

  const closers: CloserRow[] = [];
  const seenUserIds = new Set<string>();

  if (owner) {
    closers.push({
      userId: owner.id,
      memberId: null,
      name: owner.displayName || owner.email,
      email: owner.email,
      status: "owner",
      isOwner: true,
    });
    seenUserIds.add(owner.id);
  }

  for (const row of teamCloserRows) {
    const userId = row.user?.id ?? null;
    if (userId && seenUserIds.has(userId)) continue;
    if (userId) seenUserIds.add(userId);

    const isActive = row.member.status === "active" && userId !== null;
    closers.push({
      userId,
      memberId: row.member.id,
      name: row.user?.displayName || row.user?.email || row.member.email,
      email: row.user?.email || row.member.email,
      status: isActive ? "active" : "invited",
      isOwner: false,
    });
  }

  return closers;
});

export async function getActiveClosers(accountId: string): Promise<ActiveCloser[]> {
  return (await getClosers(accountId))
    .filter((closer): closer is CloserRow & { userId: string } => closer.userId !== null && closer.status !== "invited")
    .map((closer) => ({
      id: closer.userId,
      name: closer.name,
      email: closer.email,
      isOwner: closer.isOwner,
    }));
}

export async function getActiveCloser(accountId: string, closerId: string): Promise<ActiveCloser | null> {
  return (await getActiveClosers(accountId)).find((closer) => closer.id === closerId) ?? null;
}
