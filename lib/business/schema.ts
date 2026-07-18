import { z } from "zod";

// One schema per business_profile section — shared by the section's client
// form and its server action (app/(app)/business/actions.ts), the only place
// a raw section blob is trusted, per CLAUDE.md's rule against unvalidated
// `as` on external input. Every field is optional/nullable: no field in
// "Mon business" is mandatory (see CLAUDE.md — the app runs in degraded mode
// and nudges completion via empty states instead of blocking forms).

const enabledFlag = z.enum(["yes", "no"]).nullable();

export const identitySchema = z.object({
  niche: z.string().max(200),
  avatarDescription: z.string().max(4000),
  mrrCurrent: z.number().nonnegative().nullable(),
  mrrGoal: z.number().nonnegative().nullable(),
  acquisitionMode: z.enum(["organique", "ads", "hybride"]).nullable(),
});

const platformSchema = z.object({
  name: z.string().min(1).max(60),
  url: z.string().max(500),
  postsPerWeek: z.number().int().min(0).max(100).nullable(),
});

export const acquisitionSchema = z.object({
  platforms: z.array(platformSchema).max(10),
  leadMagnet: z.object({
    enabled: enabledFlag,
    type: z.enum(["pdf", "video", "formation_gratuite", "communaute", "audit", "autre"]).nullable(),
    title: z.string().max(200),
    promise: z.string().max(1000),
    url: z.string().max(500),
  }),
  vsl: z.object({
    enabled: enabledFlag,
    url: z.string().max(500),
    durationMin: z.number().int().min(0).max(600).nullable(),
    cta: z.string().max(200),
  }),
  setting: z.object({
    enabled: enabledFlag,
    channel: z.string().max(100),
    operator: z.string().max(100),
  }),
});

const offerSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(120),
  price: z.number().nonnegative().nullable(),
  type: z.enum(["formation", "coaching", "accompagnement", "saas", "autre"]).nullable(),
  saleMode: z.enum(["appel_closing", "page_vente", "dm"]).nullable(),
  recurrence: z.enum(["one_shot", "mensuel", "annuel"]).nullable(),
  isMain: z.boolean(),
});

export const salesSchema = z.object({
  offers: z.array(offerSchema).max(20),
  closing: z.object({
    closer: z.enum(["moi", "closer"]).nullable(),
    avgCallDurationMin: z.number().int().min(0).max(300).nullable(),
    hasScript: z.boolean().nullable(),
  }),
  followups: z.object({
    nonBuyers: z.boolean().nullable(),
    noShow: z.boolean().nullable(),
    failedPayments: z.boolean().nullable(),
  }),
});

export const deliverySchema = z.object({
  onboardingDescription: z.string().max(4000),
  support: z.object({
    format: z.enum(["communaute", "calls_groupe", "un_to_un", "aucun"]).nullable(),
    frequency: z.string().max(200),
  }),
  testimonials: z.object({
    count: z.number().int().nonnegative().nullable(),
    displayedOn: z.array(z.string().max(60)).max(20),
  }),
  upsellOfferId: z.string().max(100).nullable(),
});

export const businessProfileSectionSchemas = {
  identity: identitySchema,
  acquisition: acquisitionSchema,
  sales: salesSchema,
  delivery: deliverySchema,
} as const;
