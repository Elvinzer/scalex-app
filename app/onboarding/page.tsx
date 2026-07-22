import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { MONTH_LABELS } from "@/lib/monthly-metrics/types";

import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Ton diagnostic en 3 minutes — Scale X",
  description: "Renseigne ton offre et tes chiffres du mois dernier pour voir ton premier goulot chiffré en €.",
};

export default async function OnboardingPage() {
  const { user } = await getCurrentUser();

  // Existing users (or anyone who's already been through this, including a
  // skip) never see this flow again — every entry point (marketing CTAs,
  // auth/confirm, this route itself) lands here first, so this single
  // check is enough.
  if (user?.onboardingCompleted) {
    redirect("/dashboard");
  }

  if (user) {
    await track("onboarding_step_completed", user.id, { step: 1 });
  }

  const previousMonth = lastCompletedMonths(1)[0];
  const previousMonthLabel = `${MONTH_LABELS[previousMonth.month - 1]} ${previousMonth.year}`;

  // Optional step-4 questionnaire: the levers still needing a question for this
  // user, snapshotted here (step 1 never touches the 4 profile-backed levers,
  // so this list stays valid through the wizard). `user` is guaranteed here —
  // onboardingCompleted users were redirected above.
  const discovery = user ? await getDiscoveryState(user.id) : null;

  return (
    <OnboardingFlow
      previousMonthYear={previousMonth.year}
      previousMonthNum={previousMonth.month}
      previousMonthLabel={previousMonthLabel}
      discoveryLevers={discovery?.remainingLevers ?? []}
      discoveryTotal={discovery?.total ?? 0}
      discoveryAnswered={discovery?.answered ?? 0}
    />
  );
}
