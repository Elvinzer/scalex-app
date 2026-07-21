import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

// Shared by app/admin/layout.tsx (page-level, redirects), every Server
// Action under app/admin/** (must check independently — Server Actions are
// directly callable and don't inherit a layout's guard), and
// lib/team/context.ts / lib/billing/plan-gate.ts (admins get unrestricted
// access everywhere, not just /admin — see those files). Still just an
// email allowlist (ADMIN_EMAILS), per app/admin/layout.tsx's original
// comment: no role column on `users`, appropriate for a two-person pre-PMF
// team.
export function isAdminEmail(email: string): boolean {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((entry) => entry.trim().toLowerCase());
  return adminEmails.includes(email.toLowerCase());
}

// Deliberately doesn't import requireUserId from lib/current-user: that
// module imports lib/team/context.ts, which imports this file for
// isAdminEmail — routing through requireUserId here would create an import
// cycle. Same claims-check shape, just inlined.
export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    throw new Error("Accès refusé.");
  }
  const userId = data.claims.sub as string;

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !isAdminEmail(user.email)) {
    throw new Error("Accès refusé.");
  }
  return { userId };
}
