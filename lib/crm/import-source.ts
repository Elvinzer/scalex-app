import {
  CRM_LEAD_SOURCES,
  type CrmLeadSource,
} from "./types";
import type { CrmImportSheet } from "./import-schema";

const SOURCE_ALIASES: Record<string, CrmLeadSource> = {
  ig: "instagram",
  insta: "instagram",
  meta: "ads",
  meta_ads: "ads",
  facebook_ads: "ads",
  paid_ads: "ads",
  newsletter: "email_newsletter",
  email: "email_newsletter",
  referral: "bouche_a_oreille",
  word_of_mouth: "bouche_a_oreille",
  unknown: "autre",
};

function normalizedLabel(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeCrmSource(raw: string | null | undefined): CrmLeadSource | null {
  const key = normalizedLabel(raw ?? "");
  if (!key) return null;
  if (CRM_LEAD_SOURCES.includes(key as CrmLeadSource)) return key as CrmLeadSource;
  return SOURCE_ALIASES[key] ?? null;
}

function sourceValuesForSheet(sheet: CrmImportSheet): string[] {
  const sourceMapping = sheet.mapping.mappings.find((mapping) => mapping.targetField === "source");
  return sourceMapping?.columnValues ?? [];
}

export function sheetNeedsDefaultSource(sheet: CrmImportSheet): boolean {
  const values = sourceValuesForSheet(sheet);
  return values.length === 0 || values.some((value) => !value.trim() || !normalizeCrmSource(value));
}
