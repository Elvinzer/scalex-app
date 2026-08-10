import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { matchLocaleFromAcceptLanguage } from "@/lib/i18n/config";
import { getStoredUserLocale } from "@/lib/i18n/locale";

import { OnboardingFlow } from "./onboarding-flow";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function OnboardingPage() {
  const { user } = await getCurrentUser();

  // Existing users (or anyone who's already been through this, including a
  // skip) never see this flow again — every entry point (marketing CTAs,
  // auth/confirm, this route itself) lands here first, so this single
  // check is enough.
  if (user?.onboardingCompleted) {
    redirect("/roadmap");
  }

  if (user) {
    await track("onboarding_step_completed", user.id, { step: 1 });
  }

  const previousMonth = lastCompletedMonths(1)[0];
  const locale = await getLocale();
  const previousMonthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(previousMonth.year, previousMonth.month - 1, 1))
  );

  // Optional step-4 questionnaire: the levers still needing a question for this
  // user, snapshotted here (step 1 never touches the 4 profile-backed levers,
  // so this list stays valid through the wizard). `user` is guaranteed here —
  // onboardingCompleted users were redirected above.
  const discovery = user ? await getDiscoveryState(user.id) : null;

  // The browser only PRE-SELECTS (§A). An account that already holds a locale
  // skips step 0 entirely rather than being asked twice.
  const storedLocale = await getStoredUserLocale();
  const headerStore = await headers();
  const suggestedLocale = matchLocaleFromAcceptLanguage(headerStore.get("accept-language"));

  return (
    <OnboardingFlow
      previousMonthYear={previousMonth.year}
      previousMonthNum={previousMonth.month}
      previousMonthLabel={previousMonthLabel}
      discoveryLevers={discovery?.remainingLevers ?? []}
      discoveryTotal={discovery?.total ?? 0}
      discoveryAnswered={discovery?.answered ?? 0}
      needsLanguageChoice={storedLocale === null}
      suggestedLocale={storedLocale ?? suggestedLocale}
    />
  );
}
