import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { leversCatalog } from "@/db/schema";
import type { BusinessProfileData } from "@/lib/business/types";

export type LeverQuestion = {
  key: string;
  prompt: string;
  kind: "yes_no_notyet" | "stat_number" | "stat_text" | "select";
  unit?: string;
  options?: string[]; // only for kind: "select"
};

export type LeverCategory = "acquisition" | "vente" | "delivrabilite";

export type LeverCatalogEntry = {
  id: string;
  leverKey: string;
  label: string;
  category: LeverCategory;
  questions: LeverQuestion[];
  readsFromProfile: boolean;
  benchmarkValue: number | null;
  benchmarkStatKey: string | null;
  formulaType: "leads_x_rate_x_closing_x_price" | "clients_x_takerate_x_price_fraction" | "none";
  formulaParams: Record<string, number>;
  effort: "faible" | "moyen" | "eleve";
  sortOrder: number;
};

export const TOTAL_LEVER_COUNT_FALLBACK = 19; // used only if the catalog table is ever empty

export async function getLeversCatalog(): Promise<LeverCatalogEntry[]> {
  const rows = await db
    .select()
    .from(leversCatalog)
    .where(eq(leversCatalog.isActive, true))
    .orderBy(asc(leversCatalog.category), asc(leversCatalog.sortOrder));

  return rows.map((row) => ({
      id: row.id,
      leverKey: row.leverKey,
      label: row.label,
      category: row.category as LeverCategory,
      questions: row.questions,
      readsFromProfile: row.readsFromProfile,
      benchmarkValue: row.benchmarkValue,
      benchmarkStatKey: row.benchmarkStatKey,
      formulaType: row.formulaType,
      formulaParams: row.formulaParams,
      effort: row.effort as "faible" | "moyen" | "eleve",
      sortOrder: row.sortOrder,
    }));
}

// The 4 levers explicitly called out in the brief as "already in
// business_profile, never re-ask" — each resolved from the CLOSEST real
// field, documented honestly where the brief assumed a field that doesn't
// actually exist (sequence_relance_non_acheteurs is a plain yes/no toggle,
// not a real sequence; onboarding_structure has no structured field at all,
// only free text). Returns null for every other lever_key, meaning "ask
// the question normally".
export function resolveFromBusinessProfile(leverKey: string, profile: BusinessProfileData): "active" | "absent" | null {
  switch (leverKey) {
    case "vsl":
      return profile.acquisition.vsl.enabled === "yes" ? "active" : "absent";
    case "sequence_relance_non_acheteurs":
      return profile.sales.followups.nonBuyers === true ? "active" : "absent";
    case "upsell_ascension":
      return profile.delivery.upsellOfferId !== null ? "active" : "absent";
    case "onboarding_structure":
      return profile.delivery.onboardingDescription.trim().length > 0 ? "active" : "absent";
    default:
      return null;
  }
}
