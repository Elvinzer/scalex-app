import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

// Shared by every (app) page: the auth guard in app/(app)/layout.tsx
// already ensures a session exists, so this trusts the claims are present.
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data!.claims.sub as string;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return { userId, user };
}
