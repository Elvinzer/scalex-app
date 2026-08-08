import { META_CAMPAIGN_TYPES } from "./types";
import type { MetaCampaignType, MetaRawObject } from "./types";

function searchableText(raw: MetaRawObject): string {
  const promotedObject = raw.promoted_object;
  const promotedText = typeof promotedObject === "object" && promotedObject !== null ? JSON.stringify(promotedObject) : "";
  return [raw.name, raw.objective, raw.optimization_goal, promotedText]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}
export function classifyMetaCampaign(raw: MetaRawObject): { type: MetaCampaignType; confidence: number } {
  const text = searchableText(raw);
  const rules: { type: MetaCampaignType; confidence: number; terms: string[] }[] = [
    { type: "webinar", confidence: 0.92, terms: ["webinar", "masterclass", "workshop", "live training"] },
    { type: "vsl", confidence: 0.9, terms: ["vsl", "video sales letter", "sales video", "video de vente"] },
    {
      type: "instagram_profile_growth",
      confidence: 0.95,
      terms: ["profile visit", "profile visits", "followers", "follower", "instagram profile"],
    },
    { type: "retargeting", confidence: 0.85, terms: ["retarget", "remarketing", "warm", "website visitors", "engagers"] },
  ];
  for (const rule of rules) {
    if (rule.terms.some((term) => text.includes(term))) return { type: rule.type, confidence: rule.confidence };
  }
  return { type: META_CAMPAIGN_TYPES[META_CAMPAIGN_TYPES.length - 1], confidence: 0.2 };
}
