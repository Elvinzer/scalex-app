import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AppSidebar } from "@/components/app-sidebar";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getBusinessProfile } from "@/lib/business/queries";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { ensureUserRow } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/team/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    redirect("/sign-in");
  }

  const email = data.claims.email;
  const userId = data.claims.sub as string;

  if (typeof email === "string") {
    await ensureUserRow(userId, email);
  }

  const context = await getAccountContext(userId);
  if (!context) {
    // A team member whose account's Scale X subscription lapsed — blocked
    // immediately, not just future invites (see lib/billing/plan-gate.ts).
    return (
      <div className="flex min-h-screen items-center justify-center bg-panel px-8">
        <div className="sticker-card max-w-md p-8 text-center">
          <p className="text-lg font-bold">Accès suspendu</p>
          <p className="mt-2 text-sm text-muted-foreground">
            L&apos;abonnement Scale X du compte auquel tu es rattaché n&apos;est plus actif.
            Contacte le propriétaire du compte pour rétablir l&apos;accès.
          </p>
        </div>
      </div>
    );
  }
  const { accountId, isOwner } = context;
  const permissions: readonly PermissionKey[] = isOwner ? PERMISSION_KEYS : [...context.permissions] as PermissionKey[];
  // Independent of isOwner/team roles — the founders-only allowlist behind
  // /admin (see lib/admin.ts). Nav visibility only; /admin/layout.tsx still
  // does its own server-side check regardless of this.
  const isAdmin = typeof email === "string" && isAdminEmail(email);

  // Runs on every navigation inside (app) — getBusinessProfile and the
  // users row read are independent, so awaiting them one after another was
  // a pure, avoidable round-trip on literally every page change. Both are
  // scoped by accountId (the business's owner), not userId (who's logged
  // in) — a team member sees the account's business context, never their
  // own empty one.
  const [businessProfile, [userRow]] = await Promise.all([
    getBusinessProfile(accountId),
    db.select().from(users).where(eq(users.id, accountId)).limit(1),
  ]);

  // Proactive "the AI has something to say" signal for the floating bubble
  // — true when the user has real business data to diagnose (not thin/empty)
  // but has never opened a conversation about any specific metric yet
  // (lastImproveMetricKey is only ever set by lib/improve-chat-tracking.ts,
  // when a metric-scoped chat is opened). A simple, no-new-schema proxy for
  // "there's a real bottleneck you haven't discussed with the AI" rather
  // than recomputing the full diagnostic cascade on every navigation.
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !userRow?.lastImproveMetricKey;

  return (
    <div className="flex min-h-screen bg-panel">
      <AppSidebar
        email={typeof email === "string" ? email : ""}
        businessName={businessProfile.identity.businessName}
        isOwner={isOwner}
        permissions={permissions}
        isAdmin={isAdmin}
      />
      <main className="ml-64 flex-1 px-8 py-10 sm:px-12 lg:px-16">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
    </div>
  );
}
