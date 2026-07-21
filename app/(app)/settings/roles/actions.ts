"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { teamRoles } from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import { requireOwner } from "@/lib/team/context";
import { createRoleInputSchema, rolePermissionsInputSchema } from "@/lib/team/schema";

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

  revalidatePath("/settings/roles");
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

  revalidatePath("/settings/roles");
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
  revalidatePath("/settings/roles");
  return { error: null };
}
