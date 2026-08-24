import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";

import { getAuthIdentity } from "@/lib/auth/request";
import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { getUserById } from "@/lib/current-user";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";
import { getStaffContext } from "@/lib/staff/permissions";

import { AdminNav } from "./admin-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAuthIdentity();
  if (!identity) {
    redirect("/sign-in");
  }
  const staff = await getStaffContext(identity.userId, identity.email);
  if (!staff.isFounder && !staff.staffMemberId) {
    redirect("/dashboard");
  }
  const user = await getUserById(identity.userId);
  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "navigation", "support"]);
  const navigationT = await getTranslations("navigation");
  const supportT = await getTranslations("support");

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppThemeProvider initialPreference={user?.themePreference ?? "light"}>
        <div className="min-h-screen bg-panel px-8 py-10 sm:px-12 lg:px-16">
          <header className="mx-auto max-w-6xl">
            <Link
              href="/dashboard"
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              {supportT("admin.backToDashboard")}
            </Link>
            <AdminNav
              labels={{
                ariaLabel: navigationT("adminNavigation"),
                dashboard: navigationT("dashboard"),
                ideas: navigationT("adminIdeas"),
                subscriptions: navigationT("adminSubscriptions"),
                plans: navigationT("adminPlans"),
                referrals: navigationT("referral"),
                support: supportT("admin.navTitle"),
              }}
            />
          </header>
          <main id="main-content">{children}</main>
        </div>
      </AppThemeProvider>
    </NextIntlClientProvider>
  );
}
