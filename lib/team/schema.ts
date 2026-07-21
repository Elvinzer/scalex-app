import { z } from "zod";

import { PERMISSION_KEYS } from "@/lib/team/permissions";

export const inviteMemberInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  roleIds: z.array(z.string().uuid()).min(1, "Sélectionne au moins un rôle"),
});

export const memberRolesInputSchema = z.array(z.string().uuid());

export const rolePermissionsInputSchema = z.array(z.enum(PERMISSION_KEYS));

export const createRoleInputSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(60),
  permissions: z.array(z.enum(PERMISSION_KEYS)),
});
