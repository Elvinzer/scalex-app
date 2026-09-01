"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserIdOrError } from "@/lib/current-user";
import { requireOwner } from "@/lib/team/context";

const activationSchema = z.object({ enabled: z.boolean() });

export async function setCrmEnabled(input: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire du compte peut modifier cette activation." };
  const parsed = activationSchema.safeParse(input);
  if (!parsed.success) return { error: "Activation CRM invalide." };

  await db.update(users).set({ crmEnabled: parsed.data.enabled }).where(eq(users.id, access.accountId));
  revalidatePath("/crm", "layout");
  revalidatePath("/settings/modules/crm");
  revalidatePath("/dashboard");
  return { error: null };
}
