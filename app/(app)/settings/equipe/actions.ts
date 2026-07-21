"use server";

import { randomBytes } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { subscriptionPlans, subscriptions, teamMemberRoles, teamMembers, teamRoles } from "@/db/schema";
import { hasActiveTeamSubscription } from "@/lib/billing/plan-gate";
import { getBusinessProfile } from "@/lib/business/queries";
import { requireUserId } from "@/lib/current-user";
import { getResendClient } from "@/lib/resend-client";
import { requireOwner } from "@/lib/team/context";
import {
  createRoleInputSchema,
  inviteMemberInputSchema,
  memberRolesInputSchema,
  rolePermissionsInputSchema,
} from "@/lib/team/schema";
import { requireEnv } from "@/lib/utils";

const INVITE_EXPIRY_DAYS = 7;

async function validateRoleIds(accountId: string, roleIds: string[]): Promise<boolean> {
  const accountRoles = await db.select({ id: teamRoles.id }).from(teamRoles).where(eq(teamRoles.accountId, accountId));
  const validIds = new Set(accountRoles.map((role) => role.id));
  return roleIds.every((id) => validIds.has(id));
}

export async function inviteMember(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };
  const { accountId } = access;

  if (!(await hasActiveTeamSubscription(accountId))) {
    return { error: "Ton abonnement Scale X n'inclut pas les membres d'équipe." };
  }

  const parsed = inviteMemberInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  const { email, roleIds } = parsed.data;

  if (!(await validateRoleIds(accountId, roleIds))) {
    return { error: "Rôle invalide" };
  }

  const [subscriptionRow] = await db
    .select({ features: subscriptionPlans.features })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, accountId))
    .limit(1);
  const maxTeamMembers = (subscriptionRow?.features as { maxTeamMembers?: number | null } | undefined)?.maxTeamMembers ?? null;

  if (maxTeamMembers !== null) {
    const others = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.accountId, accountId), ne(teamMembers.status, "removed"), ne(teamMembers.email, email)));
    if (others.length >= maxTeamMembers) {
      return { error: `Ton plan est limité à ${maxTeamMembers} membre${maxTeamMembers > 1 ? "s" : ""} d'équipe.` };
    }
  }

  const token = randomBytes(24).toString("hex");
  const inviteExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Upserts on (accountId, email): re-inviting someone already invited (or
  // previously removed) resets their status/token/roles cleanly instead of
  // colliding with the unique constraint.
  const [member] = await db
    .insert(teamMembers)
    .values({ accountId, email, status: "invited", inviteToken: token, inviteExpiresAt, invitedByUserId: userId })
    .onConflictDoUpdate({
      target: [teamMembers.accountId, teamMembers.email],
      set: {
        status: "invited",
        inviteToken: token,
        inviteExpiresAt,
        invitedByUserId: userId,
        invitedAt: new Date(),
        memberUserId: null,
        joinedAt: null,
      },
    })
    .returning({ id: teamMembers.id });

  await db.delete(teamMemberRoles).where(eq(teamMemberRoles.teamMemberId, member.id));
  await db.insert(teamMemberRoles).values(roleIds.map((roleId) => ({ teamMemberId: member.id, roleId })));

  const profile = await getBusinessProfile(accountId);
  const businessName = profile.identity.businessName || "Scale X";
  const inviteUrl = `${requireEnv("APP_URL")}/invite/${token}`;

  const resend = getResendClient();
  await resend.emails.send({
    from: "Scale X <team@scalex.app>",
    to: email,
    subject: `${businessName} t'invite sur Scale X`,
    text: `Tu as été invité à rejoindre l'équipe ${businessName} sur Scale X.\n\nAccepte l'invitation : ${inviteUrl}\n\nCe lien expire dans ${INVITE_EXPIRY_DAYS} jours.`,
  });

  revalidatePath("/settings/equipe");
  return { error: null };
}

export async function removeMember(memberId: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

  await db
    .update(teamMembers)
    .set({ status: "removed" })
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.accountId, access.accountId)));

  revalidatePath("/settings/equipe");
  return { error: null };
}

export async function updateMemberRoles(memberId: string, roleIds: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };
  const { accountId } = access;

  const parsed = memberRolesInputSchema.safeParse(roleIds);
  if (!parsed.success) {
    return { error: "Rôles invalides" };
  }

  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.id, memberId), eq(teamMembers.accountId, accountId)))
    .limit(1);
  if (!member) return { error: "Membre introuvable" };

  if (!(await validateRoleIds(accountId, parsed.data))) {
    return { error: "Rôle invalide" };
  }

  await db.delete(teamMemberRoles).where(eq(teamMemberRoles.teamMemberId, memberId));
  if (parsed.data.length > 0) {
    await db.insert(teamMemberRoles).values(parsed.data.map((roleId) => ({ teamMemberId: memberId, roleId })));
  }

  revalidatePath("/settings/equipe");
  return { error: null };
}

export async function updateRolePermissions(roleId: string, permissions: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

  const parsed = rolePermissionsInputSchema.safeParse(permissions);
  if (!parsed.success) return { error: "Permissions invalides" };

  const updated = await db
    .update(teamRoles)
    .set({ permissions: parsed.data, updatedAt: new Date() })
    .where(and(eq(teamRoles.id, roleId), eq(teamRoles.accountId, access.accountId)))
    .returning({ id: teamRoles.id });

  if (updated.length === 0) return { error: "Rôle introuvable" };

  revalidatePath("/settings/equipe");
  return { error: null };
}

export async function createRole(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

  const parsed = createRoleInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  const key = parsed.data.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!key) return { error: "Nom invalide" };

  try {
    await db.insert(teamRoles).values({
      accountId: access.accountId,
      key,
      name: parsed.data.name,
      permissions: parsed.data.permissions,
      isDefault: false,
    });
  } catch {
    return { error: "Un rôle avec un nom proche existe déjà" };
  }

  revalidatePath("/settings/equipe");
  return { error: null };
}

export async function deleteRole(roleId: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  const access = await requireOwner(userId);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

  const [role] = await db
    .select({ isDefault: teamRoles.isDefault })
    .from(teamRoles)
    .where(and(eq(teamRoles.id, roleId), eq(teamRoles.accountId, access.accountId)))
    .limit(1);
  if (!role) return { error: "Rôle introuvable" };
  if (role.isDefault) return { error: "Les rôles pré-configurés ne peuvent pas être supprimés." };

  await db.delete(teamRoles).where(eq(teamRoles.id, roleId));
  revalidatePath("/settings/equipe");
  return { error: null };
}
