import type { LeverCategory, LeverQuestion } from "./catalog";

export const LEVER_LABEL_KEYS: Record<string, string> = {
  lead_magnet: "leadMagnet",
  email_marketing: "emailMarketing",
  newsletter: "newsletter",
  seo_blog: "seoBlog",
  podcast: "podcast",
  retargeting: "retargeting",
  referral: "referral",
  ads: "ads",
  vsl: "vsl",
  webinar: "webinar",
  sequence_relance_non_acheteurs: "nonBuyerFollowup",
  order_bump: "orderBump",
  downsell: "downsell",
  garantie: "guarantee",
  preuve_sociale_page: "socialProof",
  upsell_ascension: "upsell",
  onboarding_structure: "onboarding",
  collecte_temoignages_systematique: "testimonials",
  communaute_clients: "community",
  reactivation_anciens_clients: "reactivation",
};

const QUESTION_COPY_EN: Record<string, { prompt: string; options?: Record<string, string> }> = {
  hasLeadMagnet: { prompt: "Do you offer a lead magnet (PDF, free training…)?" },
  type: { prompt: "What type of lead magnet?" },
  optinRate: { prompt: "Approximate opt-in rate on your dedicated page?" },
  hasEmailMarketing: { prompt: "Do you email your list?" },
  listSize: { prompt: "How large is your list?" },
  frequencyPerWeek: { prompt: "How often do you send emails each week?" },
  openRate: { prompt: "Approximate open rate?" },
  ctr: { prompt: "Approximate click-through rate?" },
  revenueAttributed: { prompt: "Approximate monthly revenue attributed to email marketing?" },
  hasNewsletter: { prompt: "Do you send a regular newsletter (separate from automated sequences)?" },
  hasSeoBlog: { prompt: "Do you have a blog / SEO content?" },
  hasPodcast: { prompt: "Do you have a podcast?" },
  frequencyPerMonth: { prompt: "How often per month?" },
  hasRetargeting: { prompt: "Do you retarget your visitors/viewers?" },
  hasReferral: { prompt: "Can your customers refer others to you?" },
  hasAds: { prompt: "Do you run paid advertising (Meta, Google, TikTok, LinkedIn)?" },
  channel: {
    prompt: "Main advertising channel",
    options: {
      "Meta — génération de leads": "Meta — lead generation",
      "Meta — ecommerce": "Meta — ecommerce",
      "Meta — trafic / notoriété": "Meta — traffic / awareness",
      "Google Search": "Google Search",
      "YouTube Ads": "YouTube Ads",
      "TikTok — génération de leads": "TikTok — lead generation",
      "TikTok — ecommerce": "TikTok — ecommerce",
      "LinkedIn — B2B": "LinkedIn — B2B",
    },
  },
  monthlySpend: { prompt: "Approximate monthly ad budget?" },
  monthlyResults: { prompt: "Approximate leads or customers generated per month?" },
  hasWebinar: { prompt: "Do you run sales webinars/masterclasses?" },
  inscrits: { prompt: "Average number of registrants?" },
  presents: { prompt: "Average number of attendees?" },
  showUpRate: { prompt: "Approximate attendance rate?" },
  ventes: { prompt: "Average sales generated per session?" },
  hasOrderBump: { prompt: "Do you offer a complementary product at checkout?" },
  hasDownsell: { prompt: "Do you offer a lower-priced alternative after a refusal?" },
  hasGarantie: { prompt: "Does your offer include a clearly stated guarantee?" },
  hasPreuveSociale: { prompt: "Do you have testimonials on your sales page?" },
  hasCollecteTemoignages: { prompt: "Do you have a process for requesting testimonials?" },
  hasCommunaute: { prompt: "Do your customers have a community space?" },
  hasReactivation: { prompt: "Do you contact past customers again?" },
};

export function localizeLeverLabel(
  leverKey: string,
  fallback: string,
  locale: string,
  translate: (key: string) => string
): string {
  const labelKey = LEVER_LABEL_KEYS[leverKey];
  return locale === "en" && labelKey ? translate(`levers.${labelKey}`) : fallback;
}

export function localizeLeverCategory(
  category: LeverCategory | string,
  fallback: string,
  locale: string,
  translate: (key: string) => string
): string {
  const normalized = category.toLowerCase() === "contenu" ? "content" : category.toLowerCase();
  return locale === "en" && ["acquisition", "vente", "delivrabilite", "content"].includes(normalized)
    ? translate(`categories.${normalized}`)
    : fallback;
}

export function localizeLeverQuestion(question: LeverQuestion, locale: string): LeverQuestion {
  if (locale !== "en") return question;
  const copy = QUESTION_COPY_EN[question.key];
  if (!copy) return question;
  return {
    ...question,
    prompt: copy.prompt,
    options: question.options?.map((option) => copy.options?.[option] ?? option),
  };
}
