import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireUserId } from "@/lib/current-user";

// Shared by app/admin/layout.tsx (page-level, redirects) and every Server
// Action under app/admin/** (must check independently — Server Actions are
// directly callable and don't inherit a layout's guard). Still just an email
// allowlist (ADMIN_EMAILS), per app/admin/layout.tsx's original comment: no
// role column on `users`, appropriate for a two-person pre-PMF team.
export function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const userId = await requireUserId();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Accès refusé.");
  }
  return { userId };
}
