import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "@/lib/current-user";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

// First role-gated route in this codebase — no `role` column exists on
// `users`, so this is a simple email allowlist (ADMIN_EMAILS, comma
// separated) rather than a DB-backed permission system, appropriate for a
// two-person pre-PMF team. No sidebar (founders-only, not product chrome).
// See lib/admin.ts's requireAdmin() for the equivalent check every Server
// Action under app/admin/** must run independently (this layout doesn't
// protect those — Server Actions are directly callable).
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

  if (!user || !isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  const t = await getTranslations("navigation");

  return (
    <div className="min-h-screen bg-panel px-8 py-10 sm:px-12 lg:px-16">
      <header className="mx-auto max-w-6xl">
        <a
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Retour au dashboard
        </a>
        <AdminNav
          labels={{
            ariaLabel: t("adminNavigation"),
            dashboard: t("dashboard"),
            ideas: t("adminIdeas"),
            subscriptions: t("adminSubscriptions"),
            plans: t("adminPlans"),
            referrals: t("referral"),
          }}
        />
      </header>
      <main id="main-content">{children}</main>
    </div>
  );
}
