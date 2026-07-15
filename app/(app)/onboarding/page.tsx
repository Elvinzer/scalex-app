import type { Metadata } from "next";
import { Suspense } from "react";

import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Get started — Scale X",
  description:
    "Connect Stripe and find the single bottleneck costing your business the most money.",
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingFlow />
    </Suspense>
  );
}
