// Pure functions, no server-only imports — called both from the Server
// Component (initial render) and the client page wrapper (live updates as
// the user types, before the debounced save even fires). See
// app/(app)/business/business-page-client.tsx.

import type {
  BusinessAcquisition,
  BusinessDelivery,
  BusinessIdentity,
  BusinessProfileData,
  BusinessSales,
  BusinessSection,
} from "./types";

export type SectionCompletion = { answered: number; total: number; percent: number };

function pct(answered: number, total: number): number {
  return total === 0 ? 100 : Math.round((answered / total) * 100);
}

function isFilled(value: string | number | null | undefined): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function identityCompletion(data: BusinessIdentity): SectionCompletion {
  const checks = [
    isFilled(data.niche),
    isFilled(data.avatarDescription),
    isFilled(data.mrrCurrent),
    isFilled(data.mrrGoal),
    isFilled(data.acquisitionMode),
  ];
  return { answered: checks.filter(Boolean).length, total: checks.length, percent: pct(checks.filter(Boolean).length, checks.length) };
}

function acquisitionCompletion(data: BusinessAcquisition): SectionCompletion {
  let answered = 0;
  let total = 4; // platforms slot + 3 toggles, before conditional expansion

  if (data.platforms.some((platform) => isFilled(platform.name) && isFilled(platform.url))) answered += 1;

  if (data.leadMagnet.enabled !== null) {
    answered += 1;
    if (data.leadMagnet.enabled === "yes") {
      const fields = [data.leadMagnet.type, data.leadMagnet.title, data.leadMagnet.promise, data.leadMagnet.url];
      total += fields.length;
      answered += fields.filter(isFilled).length;
    }
  }

  if (data.vsl.enabled !== null) {
    answered += 1;
    if (data.vsl.enabled === "yes") {
      const fields = [data.vsl.url, data.vsl.durationMin, data.vsl.cta];
      total += fields.length;
      answered += fields.filter(isFilled).length;
    }
  }

  if (data.setting.enabled !== null) {
    answered += 1;
    if (data.setting.enabled === "yes") {
      const fields = [data.setting.channel, data.setting.operator];
      total += fields.length;
      answered += fields.filter(isFilled).length;
    }
  }

  return { answered, total, percent: pct(answered, total) };
}

function salesCompletion(data: BusinessSales): SectionCompletion {
  const checks = [
    data.offers.some((offer) => isFilled(offer.name) && isFilled(offer.price)),
    isFilled(data.closing.closer),
    isFilled(data.closing.avgCallDurationMin),
    data.closing.hasScript !== null,
    data.followups.nonBuyers !== null,
    data.followups.noShow !== null,
    data.followups.failedPayments !== null,
  ];
  return { answered: checks.filter(Boolean).length, total: checks.length, percent: pct(checks.filter(Boolean).length, checks.length) };
}

function deliveryCompletion(data: BusinessDelivery): SectionCompletion {
  const checks = [
    isFilled(data.onboardingDescription),
    isFilled(data.support.format),
    isFilled(data.support.frequency),
    isFilled(data.testimonials.count),
    data.testimonials.displayedOn.length > 0,
    isFilled(data.upsellOfferId),
  ];
  return { answered: checks.filter(Boolean).length, total: checks.length, percent: pct(checks.filter(Boolean).length, checks.length) };
}

export function computeSectionCompletion(
  section: BusinessSection,
  data: BusinessProfileData[BusinessSection]
): SectionCompletion {
  switch (section) {
    case "identity":
      return identityCompletion(data as BusinessIdentity);
    case "acquisition":
      return acquisitionCompletion(data as BusinessAcquisition);
    case "sales":
      return salesCompletion(data as BusinessSales);
    case "delivery":
      return deliveryCompletion(data as BusinessDelivery);
  }
}

export type GlobalCompletion = {
  percent: number;
  bySection: Record<BusinessSection, SectionCompletion>;
};

export function computeGlobalCompletion(profile: BusinessProfileData): GlobalCompletion {
  const bySection = {
    identity: identityCompletion(profile.identity),
    acquisition: acquisitionCompletion(profile.acquisition),
    sales: salesCompletion(profile.sales),
    delivery: deliveryCompletion(profile.delivery),
  };

  const percent = Math.round(
    (bySection.identity.percent +
      bySection.acquisition.percent +
      bySection.sales.percent +
      bySection.delivery.percent) /
      4
  );

  return { percent, bySection };
}
