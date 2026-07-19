import { redirect } from "next/navigation";

import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

// Top-level route (sibling to (app)/(auth)/(marketing)), not inside (app) —
// the 3-screen wizard must render without the product sidebar/floating
// chat bubble ("sidebar masquée" per the onboarding spec). Auth guard +
// user-row upsert are duplicated here from app/(app)/layout.tsx via the
// shared ensureUserRow() helper rather than the raw insert, since this is
// the other entry point a fresh session can land on.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  const email = data.claims.email;
  if (typeof email === "string") {
    await ensureUserRow(data.claims.sub as string, email);
  }

  return <div className="min-h-screen bg-panel">{children}</div>;
}
