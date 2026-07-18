// Shape of the 4 business_profile jsonb columns (db/schema.ts). Plain TS
// types (not Zod-inferred) so db/schema.ts can import them without pulling
// in the Zod schemas — schema.ts imports these types, not the other way
// around.

export type AcquisitionMode = "organique" | "ads" | "hybride";

export type BusinessIdentity = {
  niche: string;
  avatarDescription: string;
  mrrCurrent: number | null;
  mrrGoal: number | null;
  acquisitionMode: AcquisitionMode | null;
};

export type Platform = {
  name: string;
  url: string;
  postsPerWeek: number | null;
};

export type LeadMagnetType = "pdf" | "video" | "formation_gratuite" | "communaute" | "audit" | "autre";

// Conditional blocks are never `null` — each carries its own tri-state
// `enabled` flag so completion scoring can tell "not yet answered" (null)
// apart from "explicitly no" ("no", counts as answered without pulling its
// sub-fields into the denominator) — see lib/business/completion.ts.
export type LeadMagnet = {
  enabled: "yes" | "no" | null;
  type: LeadMagnetType | null;
  title: string;
  promise: string;
  url: string;
};

export type Vsl = {
  enabled: "yes" | "no" | null;
  url: string;
  durationMin: number | null;
  cta: string;
};

export type BusinessAcquisitionSetting = {
  enabled: "yes" | "no" | null;
  channel: string;
  operator: string;
};

export type BusinessAcquisition = {
  platforms: Platform[];
  leadMagnet: LeadMagnet;
  vsl: Vsl;
  setting: BusinessAcquisitionSetting;
};

export type OfferType = "formation" | "coaching" | "accompagnement" | "saas" | "autre";
export type SaleMode = "appel_closing" | "page_vente" | "dm";
export type Recurrence = "one_shot" | "mensuel" | "annuel";

export type Offer = {
  id: string;
  name: string;
  price: number | null;
  type: OfferType | null;
  saleMode: SaleMode | null;
  recurrence: Recurrence | null;
  isMain: boolean;
};

export type Closing = {
  closer: "moi" | "closer" | null;
  avgCallDurationMin: number | null;
  hasScript: boolean | null;
};

export type Followups = {
  nonBuyers: boolean | null;
  noShow: boolean | null;
  failedPayments: boolean | null;
};

export type BusinessSales = {
  offers: Offer[];
  closing: Closing;
  followups: Followups;
};

export type SupportFormat = "communaute" | "calls_groupe" | "un_to_un" | "aucun";

export type Support = {
  format: SupportFormat | null;
  frequency: string;
};

export type Testimonials = {
  count: number | null;
  displayedOn: string[];
};

export type BusinessDelivery = {
  onboardingDescription: string;
  support: Support;
  testimonials: Testimonials;
  upsellOfferId: string | null;
};

export type BusinessSection = "identity" | "acquisition" | "sales" | "delivery";

export type BusinessProfileData = {
  identity: BusinessIdentity;
  acquisition: BusinessAcquisition;
  sales: BusinessSales;
  delivery: BusinessDelivery;
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfileData = {
  identity: {
    niche: "",
    avatarDescription: "",
    mrrCurrent: null,
    mrrGoal: null,
    acquisitionMode: null,
  },
  acquisition: {
    platforms: [],
    leadMagnet: { enabled: null, type: null, title: "", promise: "", url: "" },
    vsl: { enabled: null, url: "", durationMin: null, cta: "" },
    setting: { enabled: null, channel: "", operator: "" },
  },
  sales: {
    offers: [],
    closing: { closer: null, avgCallDurationMin: null, hasScript: null },
    followups: { nonBuyers: null, noShow: null, failedPayments: null },
  },
  delivery: {
    onboardingDescription: "",
    support: { format: null, frequency: "" },
    testimonials: { count: null, displayedOn: [] },
    upsellOfferId: null,
  },
};
