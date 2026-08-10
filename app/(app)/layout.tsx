import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { AppSidebarWithScaleScore } from "@/components/app-sidebar-with-scale-score";
import { FalcoPreferencesProvider } from "@/components/falco/falco-context";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { FALCO_SKIN_KEYS } from "@/lib/falco-skins";
import { getBusinessProfile } from "@/lib/business/queries";
import { computeGlobalCompletion } from "@/lib/business/completion";
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
    const t = await getTranslations("common.shared");
    return (
      <div className="flex min-h-screen items-center justify-center bg-panel px-4 sm:px-8">
        <div className="sticker-card max-w-md p-6 text-center sm:p-8">
          <p className="text-lg font-bold">{t("accessSuspended")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("subscriptionInactive")}
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
  // Same sensitivity level as the Dashboard's own € hero figure — gated by
  // the same "dashboard" permission rather than always-visible.
  const canSeeScaleScore = isOwner || permissions.includes("dashboard");

  // Runs on every navigation inside (app) — getBusinessProfile, the users
  // row read, and (when visible) the Scale Score's own KPI queries are all
  // independent, so awaiting them one after another was a pure, avoidable
  // round-trip on literally every page change. All scoped by accountId (the
  // business's owner), not userId (who's logged in) — a team member sees
  // the account's business context, never their own empty one.
  const [businessProfile, [userRow]] = await Promise.all([
    getBusinessProfile(accountId),
    db.select().from(users).where(eq(users.id, accountId)).limit(1),
  ]);
  const businessCompletion = computeGlobalCompletion(businessProfile);
  const businessCompletionCount = Object.values(businessCompletion.bySection).filter((section) => section.percent < 100).length;

  // Proactive "the AI has something to say" signal for the floating bubble
  // — true when the user has real business data to diagnose (not thin/empty)
  // but has never opened a conversation about any specific metric yet
  // (lastImproveMetricKey is only ever set by lib/improve-chat-tracking.ts,
  // when a metric-scoped chat is opened). A simple, no-new-schema proxy for
  // "there's a real bottleneck you haven't discussed with the AI" rather
  // than recomputing the full diagnostic cascade on every navigation.
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !userRow?.lastImproveMetricKey;

  const sidebarBaseProps = {
    email: typeof email === "string" ? email : "",
    businessName: businessProfile.identity.businessName,
    displayName: userRow?.displayName ?? null,
    avatarUrl: userRow?.avatarUrl ?? null,
    isOwner,
    permissions,
    isAdmin,
    businessCompletionCount,
  };

  return (
    <FalcoPreferencesProvider reduceAnimations={userRow?.reduceFalcoAnimations ?? false}>
      {/* Portraits are tiny (<20 Ko each) — preloaded once globally so the
          floating chat bubble's crossfade never waits on a first fetch,
          wherever navigation lands first. */}
      {FALCO_SKIN_KEYS.map((skin) => (
        <link key={skin} rel="prefetch" as="image" href={`/falco/skins/portraits/falco-portrait-${skin}.webp`} />
      ))}
      <div className="flex min-h-screen bg-panel">
        <Suspense fallback={<AppSidebar {...sidebarBaseProps} streak={null} scaleScore={null} scaleScoreGapText={null} scaleScoreMonthNote={null} scaleScoreDelta7d={null} scaleScoreDelta30d={null} scaleScoreSparkline={[]} currentMonthlyRevenue={null} potentialMonthlyRevenue={null} />}>
          <AppSidebarWithScaleScore
            {...sidebarBaseProps}
            accountId={accountId}
            businessProfile={businessProfile}
            sector={userRow?.sector ?? null}
            canSeeScaleScore={canSeeScaleScore}
          />
        </Suspense>
        {/* The sidebar is fixed, so reserve its width in normal document flow
            on desktop; mobile opens it as an overlay instead. */}
        <div aria-hidden="true" className="w-0 shrink-0 md:w-64" />
        <main className="relative z-0 min-w-0 flex-1 overflow-x-clip px-4 pb-24 md:px-16 md:pb-10">
          {/* Mobile keeps its compact header; desktop starts directly beside
              the sidebar because the empty horizontal bar is gone. */}
          <div aria-hidden="true" className="h-24 shrink-0 md:h-16" />
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
      </div>
    </FalcoPreferencesProvider>
  );
}
