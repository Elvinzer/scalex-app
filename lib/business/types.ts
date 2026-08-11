// Shape of the 4 business_profile jsonb columns (db/schema.ts). Plain TS
// types (not Zod-inferred) so db/schema.ts can import them without pulling
// in the Zod schemas — schema.ts imports these types, not the other way
// around.
import type { AcquisitionFunnelKey } from "@/lib/acquisition-funnels/types";

export type AcquisitionMode = "organique" | "ads" | "hybride";

export type BusinessIdentity = {
  businessName: string;
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

// Journey-specific configuration is deliberately kept in business_profile,
// not monthly_metrics. These values describe the asset/tool being used and
// stay valid across months; only performance numbers belong in the monthly
// canonical table.
export type QuizConfiguration = {
  url: string;
  questionCount: number | null;
  tool: string;
};

export type DirectCallConfiguration = {
  bookingUrl: string;
  calendarTool: string;
};

export type WebinarConfiguration = {
  format: "live" | "evergreen" | null;
  frequency: string;
  url: string;
};

export type ChallengeConfiguration = {
  durationDays: number | null;
  frequency: string;
  url: string;
};

export type NewsletterConfiguration = {
  tool: string;
  listSize: number | null;
  frequency: string;
};

export type DirectSalesConfiguration = {
  url: string;
  displayedPrice: number | null;
};

export type CommunityConfiguration = {
  platform: string;
  memberCount: number | null;
};

export type AcquisitionFunnelConfigurations = {
  quiz: QuizConfiguration;
  appel_direct: DirectCallConfiguration;
  webinaire: WebinarConfiguration;
  challenge: ChallengeConfiguration;
  newsletter: NewsletterConfiguration;
  vente_directe: DirectSalesConfiguration;
  communaute: CommunityConfiguration;
};

export type BusinessAcquisition = {
  platforms: Platform[];
  leadMagnet: LeadMagnet;
  vsl: Vsl;
  setting: BusinessAcquisitionSetting;
  funnels: AcquisitionFunnelKey[];
  primaryFunnel: AcquisitionFunnelKey;
  configurations: AcquisitionFunnelConfigurations;
  // Read-only runtime hint for existing accounts. It is stripped before a
  // profile save and lets Dashboard show the one-time confirmation nudge.
  funnelSelectionInferred?: boolean;
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
  // Non-exclusive (unlike isMain) — marks this offer as an upsell tracked
  // in Mon business, linked to real sales via
  // sales.upsellOfferId. Optional so rows saved before this field existed
  // read as false, never a migration.
  isUpsell?: boolean;
  // 0-1 fraction. When set, primes over the setter's own defaultCommissionPct
  // for any sale of this offer (lib/setters/queries.ts's computeSetterCommissions).
  // Optional/nullable, same "no migration needed" reasoning as isUpsell above.
  commissionSetterPct?: number | null;
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
    businessName: "",
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
    funnels: ["lead_magnet"],
    primaryFunnel: "lead_magnet",
    configurations: {
      quiz: { url: "", questionCount: null, tool: "" },
      appel_direct: { bookingUrl: "", calendarTool: "" },
      webinaire: { format: null, frequency: "", url: "" },
      challenge: { durationDays: null, frequency: "", url: "" },
      newsletter: { tool: "", listSize: null, frequency: "" },
      vente_directe: { url: "", displayedPrice: null },
      communaute: { platform: "", memberCount: null },
    },
    funnelSelectionInferred: false,
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
