import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar";
import { BusinessScopeProvider } from "@/components/businesses/business-scope";
import { BusinessSignOut } from "@/components/businesses/business-sign-out";
import { LazySidebarScaleScore } from "@/components/lazy-sidebar-scale-score";
import { PostHogInit } from "@/components/posthog-init";
import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { FalcoPreferencesProvider } from "@/components/falco/falco-context";
import { FloatingChatBubble } from "@/components/floating-chat-bubble";
import { SupportDrawer } from "@/components/support/support-drawer";
import { Button } from "@/components/ui/button";
import { isAdminEmail } from "@/lib/admin";
import { FALCO_SKIN_KEYS } from "@/lib/falco-skins";
import { getBusinessProfile } from "@/lib/business/queries";
import { EMPTY_BUSINESS_PROFILE } from "@/lib/business/types";
import { computeGlobalCompletion } from "@/lib/business/completion";
import { listUserBusinesses } from "@/lib/businesses/queries";
import { businessHref } from "@/lib/businesses/routing";
import { getAuthIdentity } from "@/lib/auth/request";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { getCurrentUser, getUserById } from "@/lib/current-user";
import { getAccountContext } from "@/lib/team/context";
import { getSupportUnseenActivity } from "@/lib/support/queries";
import { PERMISSION_KEYS } from "@/lib/team/permissions";
import { withDatabaseReadTimeout } from "@/lib/perf/database-read";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

async function AppChrome({
  userId,
  accountId,
  canSeeScaleScore,
  sidebarProps,
  supportLastSeenAt,
}: {
  userId: string;
  accountId: string;
  canSeeScaleScore: boolean;
  sidebarProps: AppSidebarProps;
  supportLastSeenAt: Date | null | undefined;
}) {
  const [{ user }, businessProfile, supportHasUnseenActivity] = await Promise.all([
    getCurrentUser(),
    withDatabaseReadTimeout(() => getBusinessProfile(accountId), { operation: "shell-business-profile", timeoutMs: 5_000 }).catch(() => {
      console.error("[app-shell] business profile unavailable");
      return EMPTY_BUSINESS_PROFILE;
    }),
    withDatabaseReadTimeout(() => getSupportUnseenActivity({
      userId,
      accountId,
      isOwner: sidebarProps.isOwner,
      lastSeenAt: supportLastSeenAt,
    }), { operation: "shell-support-activity", timeoutMs: 3_000 }).catch(() => {
      console.error("[app-shell] support activity unavailable");
      return false;
    }),
  ]);
  const completion = computeGlobalCompletion(businessProfile);
  const businessCompletionCount = Object.values(completion.bySection).filter((section) => section.percent < 100).length;
  const hasUnseenInsight = !isBusinessProfileThin(businessProfile) && !user?.lastImproveMetricKey;

  return (
    <>
      <AppSidebar {...sidebarProps} businessCompletionCount={businessCompletionCount} supportHasUnseenActivity={supportHasUnseenActivity} scaleScoreSlot={canSeeScaleScore ? <LazySidebarScaleScore /> : null} />
      <FloatingChatBubble hasUnseenInsight={hasUnseenInsight} />
      <SupportDrawer />
    </>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAuthIdentity();
  if (!identity) redirect("/sign-in");

  const { email, userId } = identity;
  const pathname = (await headers()).get("x-minaly-pathname") ?? "";
  const isBusinessManagement = pathname === "/businesses" || pathname.startsWith("/businesses/");
  const [context, currentUser, businesses, messages, t] = await Promise.all([
    isBusinessManagement ? Promise.resolve(null) : getAccountContext(userId, { allowSuspended: true }),
    getUserById(userId),
    listUserBusinesses(userId),
    getMessages(),
    getTranslations("businesses"),
  ]);
  const active = context?.entitlement.active === true;
  const businessId = context?.accountId ?? null;
  const permissions = active && context
    ? context.isOwner ? PERMISSION_KEYS : PERMISSION_KEYS.filter((key) => context.permissions.has(key))
    : [];
  const sidebarProps: AppSidebarProps = {
    email: email ?? "",
    displayName: currentUser?.displayName ?? null,
    avatarUrl: currentUser?.avatarUrl ?? null,
    businessName: context?.businessName ?? "",
    businessId,
    businesses,
    isOwner: context?.isOwner ?? false,
    permissions,
    crmEnabled: active && context?.crmEnabled === true,
    isAdmin: typeof email === "string" && isAdminEmail(email),
    businessCompletionCount: 0,
    supportHasUnseenActivity: false,
    restricted: !active,
  };
  const canRenderBilling = context?.isOwner === true && pathname === "/settings/facturation";
  const canRenderChildren = isBusinessManagement || active || canRenderBilling;

  return (
    <NextIntlClientProvider messages={messages}>
      <AppThemeProvider initialPreference={currentUser?.themePreference ?? "light"}>
        <FalcoPreferencesProvider reduceAnimations={currentUser?.reduceFalcoAnimations ?? false}>
          <BusinessScopeProvider businessId={businessId}>
            <PostHogInit />
            {active && FALCO_SKIN_KEYS.map((skin) => (
              <link key={skin} rel="prefetch" as="image" href={`/falco/skins/portraits/falco-portrait-${skin}.webp`} />
            ))}
            <div key={businessId ?? "business-management"} className="flex min-h-screen bg-panel">
              {active && context ? (
                <Suspense fallback={<AppSidebar {...sidebarProps} />}>
                  <AppChrome userId={userId} accountId={context.accountId} canSeeScaleScore={context.isOwner || permissions.includes("dashboard")} sidebarProps={sidebarProps} supportLastSeenAt={currentUser?.supportLastSeenAt} />
                </Suspense>
              ) : <AppSidebar {...sidebarProps} />}
              <div aria-hidden="true" className="w-0 shrink-0 md:w-64" />
              <main className="relative z-0 min-w-0 flex-1 overflow-x-clip px-4 pb-24 md:px-16 md:pb-10">
                <div aria-hidden="true" className="h-[calc(6rem+env(safe-area-inset-top))] shrink-0 md:h-16" />
                <div className="mx-auto max-w-6xl">
                  {canRenderChildren ? children : (
                    <section className="sticker-card mx-auto max-w-xl space-y-4 p-6 sm:p-8">
                      <h1 className="text-2xl font-bold tracking-tight">
                        {!context ? t("blocked.unavailableTitle") : context.isOwner ? t("blocked.ownerTitle") : t("blocked.memberTitle")}
                      </h1>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {!context ? t("blocked.unavailableDescription") : context.isOwner ? t("blocked.ownerDescription") : context.entitlement.reason === "team_unavailable" ? t("blocked.teamUnavailableDescription") : t("blocked.memberDescription")}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {context?.isOwner && <Button asChild><a href={businessHref(context.accountId, "/settings/facturation")}>{t("blocked.billing")}</a></Button>}
                        {context && !context.isOwner && context.ownerEmail && <Button asChild variant="outline"><a href={`mailto:${encodeURIComponent(context.ownerEmail)}`}>{t("blocked.contactOwner")}</a></Button>}
                        <Button asChild variant="outline"><a href="/businesses">{t("blocked.chooseAnother")}</a></Button>
                        <BusinessSignOut />
                      </div>
                    </section>
                  )}
                </div>
              </main>
            </div>
          </BusinessScopeProvider>
        </FalcoPreferencesProvider>
      </AppThemeProvider>
    </NextIntlClientProvider>
  );
}
