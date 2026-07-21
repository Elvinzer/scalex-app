"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import { requireOwnerOrRedirect } from "@/lib/team/context";

// Flips the account-level Avancé flag on for good — a one-way, one-click
// activation (no toggle-off UI), matching the brief's "activable en un
// clic." Owner-only: a team member can't unlock modules for the account
// they're a guest on. Re-checks server-side regardless of nav/card
// visibility, same rule as every other gate in this codebase.
export async function activateAdvancedModules(): Promise<void> {
  const userId = await requireUserId();
  const { accountId } = await requireOwnerOrRedirect(userId);

  await db.update(users).set({ advancedModulesEnabled: true }).where(eq(users.id, accountId));

  // "layout" so app/(app)/layout.tsx re-resolves getAccountContext and the
  // sidebar's "Activer" badge disappears immediately, not just on the next
  // unrelated navigation.
  revalidatePath("/avance", "layout");
}
