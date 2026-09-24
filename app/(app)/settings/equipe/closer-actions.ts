"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { teamMemberRoles, teamMembers, teamRoles } from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import { requireOwner } from "@/lib/team/context";

const memberIdSchema = z.string().uuid();

export async function removeCloser(memberId: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

  const parsedMemberId = memberIdSchema.safeParse(memberId);
  if (!parsedMemberId.success) return { error: "Membre introuvable" };

  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.id, parsedMemberId.data),
        eq(teamMembers.accountId, access.accountId),
        ne(teamMembers.status, "removed"),
      ),
    )
    .limit(1);
  if (!member) return { error: "Membre introuvable" };

  const [closingRole] = await db
    .select({ id: teamRoles.id })
    .from(teamRoles)
    .where(and(eq(teamRoles.accountId, access.accountId), eq(teamRoles.key, "closing")))
    .limit(1);
  if (!closingRole) return { error: "Membre introuvable" };

  const removed = await db
    .delete(teamMemberRoles)
    .where(and(eq(teamMemberRoles.teamMemberId, member.id), eq(teamMemberRoles.roleId, closingRole.id)))
    .returning({ teamMemberId: teamMemberRoles.teamMemberId });
  if (removed.length === 0) return { error: "Membre introuvable" };

  revalidatePath("/settings/equipe");
  return { error: null };
}
