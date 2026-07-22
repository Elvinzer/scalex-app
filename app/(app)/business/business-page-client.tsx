"use client";

import { useState } from "react";

import { Falco, type FalcoPose } from "@/components/falco/falco";
import { computeGlobalCompletion } from "@/lib/business/completion";
import type { BusinessProfileData } from "@/lib/business/types";

import { AcquisitionSection } from "./acquisition-section";
import { DeliverySection } from "./delivery-section";
import { IdentitySection } from "./identity-section";
import { SalesSection } from "./sales-section";

// The one deliberate exception to "no lifted client state" in this codebase:
// page-scoped (not global) useState holding the whole profile, so the header
// completion % and the Delivery section's "offre concernée" dropdown (which
// needs the live Sales offers list) can react instantly without a reload.
// Each section still persists itself via its own saveBusinessSection call —
// this wrapper only mirrors state for display math.
export function BusinessPageClient({ initialProfile }: { initialProfile: BusinessProfileData }) {
  const [profile, setProfile] = useState(initialProfile);
  const completion = computeGlobalCompletion(profile);

  const falcoPose: FalcoPose = completion.percent >= 80 ? "happy" : completion.percent >= 40 ? "neutral" : "sleeping";
  const falcoLine =
    completion.percent >= 80
      ? "Nickel. J'ai tout ce qu'il me faut pour un diagnostic précis."
      : completion.percent >= 40
        ? "On progresse. Encore quelques réponses et je vois plus clair."
        : "Aide-moi à te connaître — plus tu remplis, plus je peux t'aider.";

  return (
    <div className="flex flex-col gap-8">
      <div className="sticker-spotlight px-7 py-6">
        <div className="mb-5 hidden sm:block">
          <Falco pose={falcoPose} size="sm" animate="enter" withBubble bubbleText={falcoLine} bubbleOnDark />
        </div>
        <p className="text-xs text-mist/70">Mon business</p>
        <h1 className="mt-1 text-xl font-bold tracking-[-0.01em]">
          Plus c&apos;est complet, plus ton diagnostic est précis.
        </h1>
        <div className="mt-6 flex items-center gap-4">
          <p className="figure-hero">{completion.percent}%</p>
          <p className="text-sm text-mist/70">complété</p>
        </div>
        {/* Neutral opacity ramp instead of 4 brand colors — coral and violet
            are both reserved (action / Copilote), so a completion-by-section
            legend that isn't either of those uses one neutral tone instead. */}
        <div className="mt-4 flex h-2 gap-1 overflow-hidden rounded-full bg-mist/15">
          <div
            className="bg-text-on-dark transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.identity.percent / 4}%` }}
          />
          <div
            className="bg-text-on-dark/70 transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.acquisition.percent / 4}%` }}
          />
          <div
            className="bg-text-on-dark/45 transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.sales.percent / 4}%` }}
          />
          <div
            className="bg-text-on-dark/25 transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.delivery.percent / 4}%` }}
          />
        </div>
      </div>

      <IdentitySection
        value={profile.identity}
        onChange={(identity) => setProfile((prev) => ({ ...prev, identity }))}
      />

      <AcquisitionSection
        value={profile.acquisition}
        onChange={(acquisition) => setProfile((prev) => ({ ...prev, acquisition }))}
      />

      <SalesSection
        value={profile.sales}
        onChange={(sales) => setProfile((prev) => ({ ...prev, sales }))}
      />

      <DeliverySection
        value={profile.delivery}
        offers={profile.sales.offers}
        onChange={(delivery) => setProfile((prev) => ({ ...prev, delivery }))}
      />
    </div>
  );
}
