import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar";
import { AppSidebarWithScaleScore } from "@/components/app-sidebar-with-scale-score";
import { PostHogInit } from "@/components/posthog-init";
import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { FalcoPreferencesProvider } from "@/components/falco/falco-context";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { SupportDrawer } from "@/components/support/support-drawer";
import { isAdminEmail } from "@/lib/admin";
import { FALCO_SKIN_KEYS } from "@/lib/falco-skins";
import { getBusinessProfile } from "@/lib/business/queries";
import { computeGlobalCompletion } from "@/lib/business/completion";
import { getAuthIdentity } from "@/lib/auth/request";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { getUserById } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";
import { getSupportUnseenActivity } from "@/lib/support/queries";
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/team/permissions";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

type SidebarBaseProps = Pick<AppSidebarProps, "email" | "isOwner" | "permissions" | "isAdmin"> & {
  displayName: string | null;
};

async function AppChrome({
  userId,
  accountId,
  canSeeScaleScore,
  sidebarBaseProps,
}: {
  userId: string;
  accountId: string;
  canSeeScaleScore: boolean;
  sidebarBaseProps: SidebarBaseProps;
}) {
  const [businessProfile, userRow] = await Promise.all([
    getBusinessProfile(accountId),
    getUserById(accountId),
  ]);
  const currentUserRow = userId === accountId ? userRow : await getUserById(userId);
  const businessCompletion = computeGlobalCompletion(businessProfile);
  const businessCompletionCount = Object.values(businessCompletion.bySection).filter((section) => section.percent < 100).length;
  const sidebarProps = {
    ...sidebarBaseProps,
    businessName: businessProfile.identity.businessName,
    displayName: userRow?.displayName ?? sidebarBaseProps.displayName,
    avatarUrl: userRow?.avatarUrl ?? null,
    businessCompletionCount,
    supportHasUnseenActivity: await getSupportUnseenActivity({
      userId,
      accountId,
      isOwner: sidebarBaseProps.isOwner,
      lastSeenAt: currentUserRow?.supportLastSeenAt,
    }),
  };
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !userRow?.lastImproveMetricKey;

  return (
    <>
      <Suspense fallback={<AppSidebar {...sidebarProps} supportHasUnseenActivity={false} scaleScore={null} scaleScoreGapText={null} scaleScoreGapSources={[]} scaleScoreMonthNote={null} scaleScoreDelta7d={null} scaleScoreDelta30d={null} scaleScoreSparkline={[]} currentMonthlyRevenue={null} potentialMonthlyRevenue={null} />}>
        <AppSidebarWithScaleScore
          {...sidebarProps}
          accountId={accountId}
          businessProfile={businessProfile}
          sector={userRow?.sector ?? null}
          canSeeScaleScore={canSeeScaleScore}
          callTrackingConnected={Boolean(userRow?.iclosedConnected || userRow?.calendlyConnected)}
        />
      </Suspense>
      <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
      <SupportDrawer />
    </>
  );
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getAuthIdentity();
  if (!identity) {
    redirect("/sign-in");
  }

  const { email, userId } = identity;
  const messagesPromise = getMessages();

  const [context, currentUserRow] = await Promise.all([
    getAccountContext(userId),
    getUserById(userId),
  ]);
  if (!context) {
    // A team member whose account's Minaly subscription lapsed — blocked
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

  // The page content no longer waits for the business profile and sidebar
  // score. AppChrome loads those in its own Suspense boundary below while
  // the requested page starts rendering immediately.
  const sidebarBaseProps: SidebarBaseProps = {
    email: email ?? "",
    displayName: currentUserRow?.displayName ?? null,
    isOwner,
    permissions,
    isAdmin,
  };
  const messages = await messagesPromise;

  return (
    <NextIntlClientProvider messages={messages}>
      <AppThemeProvider initialPreference={currentUserRow?.themePreference ?? "light"}>
        <FalcoPreferencesProvider reduceAnimations={currentUserRow?.reduceFalcoAnimations ?? false}>
          <PostHogInit />
          {/* Portraits are tiny (<20 Ko each) — preloaded once globally so the
              floating chat bubble's crossfade never waits on a first fetch,
              wherever navigation lands first. */}
          {FALCO_SKIN_KEYS.map((skin) => (
            <link key={skin} rel="prefetch" as="image" href={`/falco/skins/portraits/falco-portrait-${skin}.webp`} />
          ))}
          <div className="flex min-h-screen bg-panel">
            <Suspense fallback={<AppSidebar {...sidebarBaseProps} businessName="" avatarUrl={null} businessCompletionCount={0} supportHasUnseenActivity={false} scaleScore={null} scaleScoreGapText={null} scaleScoreGapSources={[]} scaleScoreMonthNote={null} scaleScoreDelta7d={null} scaleScoreDelta30d={null} scaleScoreSparkline={[]} currentMonthlyRevenue={null} potentialMonthlyRevenue={null} />}>
              <AppChrome userId={userId} accountId={accountId} canSeeScaleScore={canSeeScaleScore} sidebarBaseProps={sidebarBaseProps} />
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
          </div>
        </FalcoPreferencesProvider>
      </AppThemeProvider>
    </NextIntlClientProvider>
  );
}
