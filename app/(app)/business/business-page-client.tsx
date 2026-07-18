"use client";

import { useState } from "react";

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

  return (
    <div className="flex flex-col gap-8">
      <div className="sticker-spotlight p-10">
        <p className="text-sm font-medium text-mist/70">Mon business</p>
        <h1 className="mt-1 text-3xl font-bold">
          Plus c&apos;est complet, plus ton diagnostic est précis.
        </h1>
        <div className="mt-6 flex items-center gap-4">
          <p className="font-display text-5xl font-bold tabular-nums">{completion.percent}%</p>
          <p className="text-sm text-mist/70">complété</p>
        </div>
        <div className="mt-4 flex h-2 gap-1 overflow-hidden rounded-full bg-mist/15">
          <div
            className="bg-violet transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.identity.percent / 4}%` }}
          />
          <div
            className="bg-signal transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.acquisition.percent / 4}%` }}
          />
          <div
            className="bg-state-healthy transition-[flex-basis]"
            style={{ flexBasis: `${completion.bySection.sales.percent / 4}%` }}
          />
          <div
            className="bg-gain transition-[flex-basis]"
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
