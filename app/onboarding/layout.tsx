import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";

import { AppThemeProvider } from "@/components/theme/app-theme-provider";
import { ensureUserRow, getUserById } from "@/lib/current-user";
import { getRequestLocale } from "@/lib/i18n/locale";
import { loadMessagesFor } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

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
  const userId = data.claims.sub as string;
  if (typeof email === "string") {
    await ensureUserRow(userId, email);
  }
  const user = await getUserById(userId);

  const locale = await getRequestLocale();
  const messages = await loadMessagesFor(locale, ["common", "onboarding", "diagnostic"]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppThemeProvider initialPreference={user?.themePreference ?? "light"}>
        <div className="min-h-screen bg-panel">{children}</div>
      </AppThemeProvider>
    </NextIntlClientProvider>
  );
}
