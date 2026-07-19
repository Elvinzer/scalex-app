import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

// First role-gated route in this codebase — no `role` column exists on
// `users`, so this is a simple email allowlist (ADMIN_EMAILS, comma
// separated) rather than a DB-backed permission system, appropriate for a
// two-person pre-PMF team. No sidebar (founders-only, not product chrome).
//
// Top-level route, not nested in (app) — unlike every page under
// app/(app)/, there's no upstream layout that already guarantees a
// session exists, so the auth check happens here explicitly before
// getCurrentUser() (which assumes one does).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    redirect("/sign-in");
  }

  const { user } = await getCurrentUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase());

  if (!user || !adminEmails.includes(user.email.toLowerCase())) {
    redirect("/dashboard");
  }

  return <div className="min-h-screen bg-panel px-8 py-10 sm:px-12 lg:px-16">{children}</div>;
}
