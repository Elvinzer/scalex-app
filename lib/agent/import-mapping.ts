import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { requestFalcoJson, type FalcoProvider } from "@/lib/agent/falco-provider";
import { normalizeCrmDate, normalizeCrmOutcome, normalizeCrmPlatform, normalizeCrmSource, normalizeCrmStage } from "@/lib/crm/import";
import {
  ALL_TARGET_FIELDS,
  CRM_IMPORT_FIELDS,
  DATA_IMPORT_FIELDS,
  IMPORT_TARGET_TABLES,
  modelMappingSchema,
  type CrmImportField,
  type ImportMappingResult,
} from "@/lib/import/schema";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import type { RawSheet } from "@/lib/import/parse";
import { falcoLanguageInstruction } from "@/lib/agent/language-instruction";

// Bump here when the model needs updating — single point of change, same
// convention as lib/agent/insight.ts.
const MODEL = "claude-sonnet-5";
// Generous headroom for a wide sheet (many columns → many mappings/
// questions in the response) — a cut-off tool_use response is invalid JSON
// and was a plausible cause of "Mapping invalide retourné par le modèle".
const MAX_TOKENS = 8000;
const MAX_ROWS_SENT_TO_MODEL = 50; // sample only — never the full 2000-row cap, keeps tokens sane
const MAX_PDF_CHARS_SENT_TO_MODEL = 20_000;
const GROQ_MAPPING_RESPONSE_SCHEMA = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const FIELD_DEFINITIONS = `Champs "monthly_metrics" (funnel mensuel — destination canonique par défaut) :
- cashCollected : CA encaissé ce mois (euros)
- cashContracted : CA contracté/signé ce mois (euros, peut différer de l'encaissé)
- newFollowers : nouveaux abonnés/leads acquis
- firstMessages : premiers messages envoyés en prospection
- conversations : conversations démarrées
- callsProposed : appels proposés
- callsBooked : appels réservés
- callsTaken : appels honorés/pris
- salesClosed : ventes conclues (un compte, pas un montant)

Champs "sales" (seulement si la feuille est manifestement une liste de ventes/clients) :
clientName, clientEmail, sourceChannel, totalPrice (euros), paymentType (one_shot|installments), saleDate, closer

Champs "crm_leads" (historique des leads, jamais des agrégats) :
profileUrl, platform, handle, displayName, firstName, lastName, email, phone, source, offerName, setterName, potentialValueEur, leadCreatedAt, messageOccurredAt, responseAt, valueContentAt, callProposedAt, callBookedAt, stage, outcome, lostReason, qualificationNote, closer

`;

const SYSTEM_PROMPT = `Tu es l'agent d'import de données de Minaly, un SaaS pour infopreneurs.
On te donne UNE feuille/fichier (tableau ou texte extrait) à la fois et tu dois la mapper vers les champs existants de l'app via l'outil map_columns.

Règles absolues, non négociables :
- Une seule table cible (targetTable) par feuille : "monthly_metrics", "sales", "crm_leads", ou "ignore" si rien ne correspond manifestement (données de tiers/veille concurrentielle, notes libres, feuille de calcul annexe...).
- "ignore" exige TOUJOURS un ignoreReason concret et court (ex: "Données de veille sur des comptes concurrents, pas tes métriques.") — jamais vide, jamais générique. N'inclus PAS le champ ignoreReason du tout si targetTable n'est pas "ignore".
- Ne JAMAIS mapper une colonne de taux/pourcentage/ratio — ces valeurs sont toujours recalculées par l'app, jamais importées. Mets cette colonne dans unmapped_columns avec l'explication.
- Ne JAMAIS inventer une valeur qui n'est pas explicitement dans le fichier.
- confidence "high" seulement si le nom de colonne et les valeurs échantillon ne laissent aucun doute. Sinon "medium" ou "low", et ajoute une question dans "questions" (max 6 questions au total — au-delà, laisse la colonne en unmapped plutôt que de rajouter une question).
- Chaque question doit citer 2-3 échantillons concrets de la colonne et proposer 2-3 champs cibles plausibles en options (jamais plus de 3, jamais "ignore" — "Ignorer cette colonne" est ajouté automatiquement, ne le liste jamais toi-même).
- Si le contenu est vertical (une métrique par ligne, avec une valeur voisine, par exemple "CA encaissé | 3550"), traite chaque ligne comme une paire libellé-valeur : sourceColumn doit reprendre le libellé de la ligne et sampleValues doit contenir sa valeur. Ne rejette pas le tableau parce qu'il n'a pas de titres de colonnes horizontaux.
- Pour une colonne dont tu ne connais pas le champ cible : N'INCLUS PAS le champ targetField du tout pour cette entrée de mappings (ne mets jamais une chaîne vide ou inventée).
- dateColumnName : le nom EXACT (tel qu'il apparaît dans les colonnes) de la colonne qui contient une date par ligne, s'il y en a une — sert à regrouper les lignes par mois EN CODE (jamais toi qui comptes/additionnes). N'inclus PAS ce champ du tout si aucune colonne date n'est exploitable.
- periodDetected : uniquement un repli quand dateColumnName est absent. N'inclus PAS ce champ du tout si tu ne peux pas déduire une période précise (ne devine jamais).

${FIELD_DEFINITIONS}`;

// Deliberately no `type: ["string", "null"]` unions anywhere below — nullable
// unions in tool JSON schemas aren't uniformly honored across structured-
// output implementations, and this schema needs to work reliably, not
// showcase the fullest JSON Schema feature set. Every "nullable" concept
// here (ignoreReason, targetField, dateColumnName, periodDetected) is
// instead expressed as a plain-typed OPTIONAL field the model omits to mean
// "none" — normalizeModelInput below fills in the real `null` our own Zod
// schema expects before validation, so the rest of the app never sees the
// difference between "omitted" and "explicitly null".
const MAP_COLUMNS_TOOL: Anthropic.Tool = {
  name: "map_columns",
  description: "Retourne le mapping des colonnes d'une feuille vers les champs cibles de Minaly.",
  input_schema: {
    type: "object",
    properties: {
      targetTable: { type: "string", enum: [...IMPORT_TARGET_TABLES] },
      ignoreReason: { type: "string", description: 'Uniquement si targetTable === "ignore" — sinon omets ce champ.' },
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceColumn: { type: "string" },
            targetField: { type: "string", enum: [...ALL_TARGET_FIELDS], description: "Omets ce champ si le champ cible est inconnu." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            granularity: { type: "string", enum: ["daily", "weekly", "monthly"] },
            sampleValues: { type: "array", items: { type: "string" }, maxItems: 5 },
          },
          required: ["sourceColumn", "confidence", "granularity", "sampleValues"],
        },
      },
      dateColumnName: { type: "string", description: "Omets ce champ si aucune colonne date n'est exploitable." },
      periodDetected: {
        type: "object",
        properties: { year: { type: "number" }, month: { type: "number" } },
        required: ["year", "month"],
        description: "Omets ce champ si aucune période ne peut être déduite.",
      },
      unmappedColumns: { type: "array", items: { type: "string" } },
      questions: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            sourceColumn: { type: "string" },
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string", enum: [...ALL_TARGET_FIELDS] }, maxItems: 3 },
          },
          required: ["sourceColumn", "prompt", "options"],
        },
      },
    },
    required: ["targetTable", "mappings", "unmappedColumns", "questions"],
  },
};

// One mappable unit per call — a single Excel sheet, or a whole PDF/image
// file (which have no sheet concept). The route (app/api/import/analyze)
// loops over every sheet of a multi-sheet workbook and calls
// mapImportedFile once per sheet, so each sheet gets its own independent
// targetTable/ignore decision instead of one verdict for the whole file.
export type MappableUnit =
  | { kind: "sheet"; fileName: string; sheet: RawSheet }
  | { kind: "text"; fileName: string; text: string }
  | { kind: "image"; fileName: string; base64: string; mediaType: string };

export type ImportMappingOptions = {
  targetTableHint?: "monthly_metrics" | "crm_leads";
  targetPeriod?: { year: number; month: number };
  locale?: Locale;
  // Supplied by the route in the user's locale when a CRM workbook sheet is
  // recognized as another kind of data (KPI, ads, content, etc.).
  crmIgnoreReason?: string;
};

export function applyImportTargetHint(result: ImportMappingResult, options?: ImportMappingOptions): ImportMappingResult {
  if (options?.targetTableHint !== "crm_leads") return result;

  const targetTable = result.targetTable === "crm_leads" ? "crm_leads" : "ignore";
  return {
    ...result,
    targetTable,
    ignoreReason: targetTable === "ignore" ? result.ignoreReason ?? options.crmIgnoreReason ?? null : null,
  };
}

function unitLabel(unit: MappableUnit): string {
  return unit.kind === "sheet" ? unit.sheet.name : unit.fileName;
}

type CrmColumnHint = {
  targetField: CrmImportField | null;
  confidence: "high" | "medium" | "low";
};

const CRM_DATE_FIELDS = new Set<CrmImportField>([
  "leadCreatedAt",
  "messageOccurredAt",
  "responseAt",
  "valueContentAt",
  "callProposedAt",
  "callBookedAt",
]);

const CONFIDENCE_RANK: Record<"high" | "medium" | "low", number> = { high: 3, medium: 2, low: 1 };

function normalizedColumnLabel(raw: string): string {
  return raw
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function nonEmptyValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function isDateColumn(values: string[]): boolean {
  const nonEmpty = nonEmptyValues(values);
  return nonEmpty.length > 0 && nonEmpty.every((value) => normalizeCrmDate(value) !== null);
}

function isPhoneLike(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && !/^\d{1,4}$/.test(value.trim());
}

function hasValidColumnValues(values: string[], normalize: (value: string) => string | null): boolean {
  const nonEmpty = nonEmptyValues(values);
  return nonEmpty.length > 0 && nonEmpty.every((value) => normalize(value) !== null);
}

function crmColumnHint(header: string, values: string[], allHeaders: string[] = []): CrmColumnHint | undefined {
  const key = normalizedColumnLabel(header);
  const nonEmpty = nonEmptyValues(values);
  const dates = isDateColumn(values);
  const hasSeparateFirstName = allHeaders.some((candidate) => /(^|_)(prenom|first_name|firstname)(_|$)/.test(normalizedColumnLabel(candidate)));

  if (!key) return undefined;
  if (/whatsapp|^wa$/.test(key)) {
    if (nonEmpty.some((value) => /^https?:\/\//i.test(value))) return { targetField: null, confidence: "high" };
    if (nonEmpty.length > 0 && nonEmpty.every(isPhoneLike)) return { targetField: "phone", confidence: "medium" };
  }
  if (/action_maintenant|next_action|prochaine_action/.test(key)) return { targetField: null, confidence: "high" };
  if (/qualite_donnee|data_quality|^rang$|^priorite$|^pays$|nb_strategy_calls/.test(key)) {
    return { targetField: null, confidence: "high" };
  }
  if (/derniere_maj|last_update|updated_at/.test(key)) {
    return dates ? { targetField: "leadCreatedAt", confidence: "low" } : { targetField: null, confidence: "high" };
  }
  if (/derniere_interaction|last_interaction/.test(key)) {
    return dates ? { targetField: "responseAt", confidence: "low" } : { targetField: null, confidence: "high" };
  }
  if (/^date$/.test(key)) return dates ? { targetField: "leadCreatedAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  if (/premier_message|first_message/.test(key)) {
    return dates ? { targetField: "messageOccurredAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/date_creation|created_at|date_lead|date_entree|date_ajout|inscription/.test(key)) {
    return dates ? { targetField: "leadCreatedAt", confidence: "high" } : { targetField: null, confidence: "high" };
  }
  if (/reponse|responded|response/.test(key)) {
    return dates ? { targetField: "responseAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/contenu|content|value_content/.test(key)) {
    return dates ? { targetField: "valueContentAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/proposition.*appel|call.*propos|appointment.*propos/.test(key)) {
    return dates ? { targetField: "callProposedAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/prise.*rendez|rdv|booked|appointment|call.*book/.test(key)) {
    return dates ? { targetField: "callBookedAt", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/(^|_)(telephone|tel|phone|mobile|gsm)(_|$)/.test(key)) return { targetField: "phone", confidence: "high" };
  if (/(^|_)(email|e_mail|mail)(_|$)/.test(key) || (key.includes("contact") && nonEmpty.some((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))) {
    return { targetField: "email", confidence: "high" };
  }
  if (/nom_affiche|display_name|full_name|nom_complet/.test(key)) return { targetField: "displayName", confidence: "high" };
  if (/(^|_)(prenom|first_name|firstname)(_|$)/.test(key)) return { targetField: "firstName", confidence: "high" };
  if (/(^|_)(nom|last_name|lastname)(_|$)/.test(key)) {
    return key === "nom" && !hasSeparateFirstName ? { targetField: "displayName", confidence: "high" } : { targetField: "lastName", confidence: "high" };
  }
  if (/pseudo|username|user_name|handle/.test(key)) return { targetField: "handle", confidence: "high" };
  if (/url.*profil|profil.*url|profile.*url|lien.*profil|profile_link/.test(key)) return { targetField: "profileUrl", confidence: "high" };
  if (/plateforme|platform|reseau|network/.test(key)) {
    return hasValidColumnValues(values, normalizeCrmPlatform) ? { targetField: "platform", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/source|canal|channel|origine|acquisition/.test(key)) {
    return hasValidColumnValues(values, normalizeCrmSource) ? { targetField: "source", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/suivi|statut|status|stage|etape/.test(key)) {
    return hasValidColumnValues(values, normalizeCrmStage) ? { targetField: "stage", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/resultat|outcome|segment/.test(key)) {
    return hasValidColumnValues(values, normalizeCrmOutcome) ? { targetField: "outcome", confidence: "medium" } : { targetField: null, confidence: "high" };
  }
  if (/commentaire|comment|note|observation|remarque/.test(key)) return { targetField: "qualificationNote", confidence: "medium" };

  return undefined;
}

function columnValuesForHeader(sheet: RawSheet, header: string): string[] {
  const index = sheet.headers.findIndex((candidate) => candidate.trim().toLowerCase() === header.trim().toLowerCase());
  return index < 0 ? [] : sheet.rows.map((row) => row[index] ?? "");
}

function isLikelyCrmSheet(sheet: RawSheet): boolean {
  const headers = sheet.headers.map(normalizedColumnLabel);
  const phoneIndex = headers.findIndex((header) => /(^|_)(telephone|tel|phone|mobile|gsm)(_|$)/.test(header));
  const emailIndex = headers.findIndex((header) => /(^|_)(email|e_mail|mail)(_|$)/.test(header));
  const profileUrlIndex = headers.findIndex((header) => /url.*profil|profil.*url|profile.*url|lien.*profil|profile_link/.test(header));
  const identityIndex = headers.findIndex((header) => /(^|_)(nom|prenom|name|first_name|last_name|pseudo|username|contact)(_|$)/.test(header));
  const hasPhone = phoneIndex >= 0 && sheet.rows.some((row) => isPhoneLike(row[phoneIndex] ?? ""));
  const hasEmail = emailIndex >= 0 && sheet.rows.some((row) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((row[emailIndex] ?? "").trim()));
  const hasProfileUrl = profileUrlIndex >= 0 && sheet.rows.some((row) => /^https?:\/\//i.test((row[profileUrlIndex] ?? "").trim()));
  return (hasPhone || hasEmail || hasProfileUrl) && identityIndex >= 0;
}

function mappingValues(unit: MappableUnit, sourceColumn: string): string[] {
  if (unit.kind !== "sheet") return [];
  const values = columnValuesForHeader(unit.sheet, sourceColumn);
  return values.length > 0 ? values : [];
}

function isValidCrmMappingValue(targetField: CrmImportField, values: string[]): boolean {
  if (!CRM_DATE_FIELDS.has(targetField)) {
    if (targetField === "stage") return hasValidColumnValues(values, normalizeCrmStage);
    if (targetField === "outcome") return hasValidColumnValues(values, normalizeCrmOutcome);
    if (targetField === "source") return hasValidColumnValues(values, normalizeCrmSource);
    if (targetField === "platform") return hasValidColumnValues(values, normalizeCrmPlatform);
    return true;
  }
  return isDateColumn(values);
}

function repairCrmMapping(result: ImportMappingResult, unit: MappableUnit, options?: ImportMappingOptions): ImportMappingResult {
  if (options?.targetTableHint !== "crm_leads" || unit.kind !== "sheet") return result;

  const shouldRecoverAsCrm = isLikelyCrmSheet(unit.sheet);
  if (!shouldRecoverAsCrm) return result;
  const targetTable = result.targetTable === "crm_leads" || shouldRecoverAsCrm ? "crm_leads" : result.targetTable;
  if (targetTable !== "crm_leads") return result;

  const repaired = result.mappings.map((mapping) => {
    const values = mappingValues(unit, mapping.sourceColumn);
    const actualHeader = unit.sheet.headers.find((header) => header.trim().toLowerCase() === mapping.sourceColumn.trim().toLowerCase());
    const hint = actualHeader ? crmColumnHint(actualHeader, values, unit.sheet.headers) : undefined;
    if (hint) return { ...mapping, targetField: hint.targetField, confidence: hint.confidence };

    const targetField = mapping.targetField as CrmImportField | null;
    if (targetField && CRM_IMPORT_FIELDS.includes(targetField) && !isValidCrmMappingValue(targetField, values.length > 0 ? values : mapping.sampleValues)) {
      return { ...mapping, targetField: null };
    }
    return mapping;
  });

  const mappedHeaders = new Set(repaired.map((mapping) => mapping.sourceColumn.trim().toLowerCase()));
  for (const [index, header] of unit.sheet.headers.entries()) {
    if (!header.trim() || mappedHeaders.has(header.trim().toLowerCase())) continue;
    const values = unit.sheet.rows.map((row) => row[index] ?? "");
    const hint = crmColumnHint(header, values, unit.sheet.headers);
    if (!hint?.targetField) continue;
    repaired.push({
      sourceColumn: header,
      targetField: hint.targetField,
      confidence: hint.confidence,
      granularity: "daily",
      sampleValues: values.slice(0, 5),
    });
  }

  const bestByField = new Map<CrmImportField, { index: number; rank: number }>();
  for (const [index, mapping] of repaired.entries()) {
    const targetField = mapping.targetField as CrmImportField | null;
    if (!targetField || !CRM_IMPORT_FIELDS.includes(targetField)) continue;
    const rank = CONFIDENCE_RANK[mapping.confidence];
    const previous = bestByField.get(targetField);
    if (!previous || rank > previous.rank) {
      if (previous) repaired[previous.index] = { ...repaired[previous.index], targetField: null };
      bestByField.set(targetField, { index, rank });
    } else {
      repaired[index] = { ...mapping, targetField: null };
    }
  }

  return {
    ...result,
    targetTable,
    ignoreReason: null,
    mappings: repaired,
  };
}

export function buildDeterministicCrmMapping(unit: MappableUnit): ImportMappingResult | null {
  if (unit.kind !== "sheet" || !isLikelyCrmSheet(unit.sheet)) return null;
  const mappings = unit.sheet.headers.map((header, index) => {
    const values = unit.sheet.rows.map((row) => row[index] ?? "");
    const hint = crmColumnHint(header, values);
    return {
      sourceColumn: header,
      targetField: hint?.targetField ?? null,
      confidence: hint?.confidence ?? "low",
      granularity: "daily" as const,
      sampleValues: values.slice(0, 5),
    };
  });
  return repairCrmMapping(
    {
      sheetName: unit.sheet.name,
      targetTable: "crm_leads",
      ignoreReason: null,
      mappings,
      dateColumnName: null,
      periodDetected: null,
      unmappedColumns: [],
      questions: [],
    },
    unit,
    { targetTableHint: "crm_leads" },
  );
}

function buildFileContent(unit: MappableUnit): Anthropic.ContentBlockParam[] {
  if (unit.kind === "image") {
    return [
      { type: "image", source: { type: "base64", media_type: unit.mediaType as "image/png" | "image/jpeg", data: unit.base64 } },
      { type: "text", text: `Capture/image "${unit.fileName}". Extrait un tableau structuré équivalent puis mappe-le.` },
    ];
  }
  if (unit.kind === "text") {
    return [{ type: "text", text: `Fichier PDF "${unit.fileName}" (texte extrait) :\n\n${unit.text.slice(0, MAX_PDF_CHARS_SENT_TO_MODEL)}` }];
  }
  const { sheet } = unit;
  const rowsText = sheet.rows
    .slice(0, MAX_ROWS_SENT_TO_MODEL)
    .map((row) => row.join(" | "))
    .join("\n");
  return [{ type: "text", text: `Feuille "${sheet.name}" (fichier "${unit.fileName}") — colonnes : ${sheet.headers.join(" | ")}\n${rowsText}` }];
}

function buildTextContent(unit: MappableUnit): string {
  if (unit.kind === "image") {
    throw new Error("Falco ne peut pas analyser une image dans cet import. Envoie un fichier Excel ou CSV.");
  }
  if (unit.kind === "text") return `Fichier PDF "${unit.fileName}" (texte extrait) :\n\n${unit.text.slice(0, MAX_PDF_CHARS_SENT_TO_MODEL)}`;
  const { sheet } = unit;
  const rowsText = sheet.rows
    .slice(0, MAX_ROWS_SENT_TO_MODEL)
    .map((row) => row.join(" | "))
    .join("\n");
  return `Feuille "${sheet.name}" (fichier "${unit.fileName}") — colonnes : ${sheet.headers.join(" | ")}\n${rowsText}`;
}

// Rate/percentage columns must never be imported (CLAUDE.md: recalculated
// in code, never pre-aggregated by the LLM) — enforced here as a
// deterministic safety net IN ADDITION to the prompt instruction, in case
// the model maps one anyway.
function looksLikeRateColumn(sampleValues: string[]): boolean {
  const nonEmpty = sampleValues.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => /%\s*$/.test(v) || /^0?[.,]\d+$/.test(v));
}

const VALID_TARGET_FIELDS = new Set<string>(ALL_TARGET_FIELDS);

// maxItems/enum/required in MAP_COLUMNS_TOOL's JSON schema already tell the
// model the shape, but tool-use schema enforcement by the model isn't
// guaranteed — normalize here too so one out-of-bounds or missing value
// (an oversized sampleValues array, "ignore" leaking into a column-level
// targetField/option even though it's only ever valid as the sheet-level
// targetTable, or an omitted optional field) never rejects an otherwise-
// usable mapping outright. This feature exists specifically to interpret
// unpredictable, off-format files, so minor model drift gets absorbed here
// instead of 500ing the whole import over it. Also fills in the real
// `null` our Zod schema expects for every field the tool schema now leaves
// optional (ignoreReason/targetField/dateColumnName/periodDetected) —
// omitted-by-the-model and explicit-null are treated identically.
function normalizeModelInput(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;

  const mappings = Array.isArray(record.mappings)
    ? record.mappings.map((entry) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const mappingEntry = entry as Record<string, unknown>;
        const targetField =
          typeof mappingEntry.targetField === "string" && VALID_TARGET_FIELDS.has(mappingEntry.targetField) ? mappingEntry.targetField : null;
        const sampleValues = Array.isArray(mappingEntry.sampleValues) ? mappingEntry.sampleValues.slice(0, 5) : [];
        return { ...mappingEntry, targetField, sampleValues };
      })
    : [];

  const questions = Array.isArray(record.questions)
    ? record.questions.slice(0, 6).map((entry) => {
        if (typeof entry !== "object" || entry === null) return entry;
        const questionEntry = entry as Record<string, unknown>;
        const options = Array.isArray(questionEntry.options)
          ? questionEntry.options.filter((option) => typeof option === "string" && VALID_TARGET_FIELDS.has(option)).slice(0, 3)
          : [];
        return { ...questionEntry, options };
      })
    : [];

  const ignoreReason = typeof record.ignoreReason === "string" && record.ignoreReason.trim().length > 0 ? record.ignoreReason : null;
  const dateColumnName = typeof record.dateColumnName === "string" && record.dateColumnName.trim().length > 0 ? record.dateColumnName : null;
  const periodDetected =
    typeof record.periodDetected === "object" &&
    record.periodDetected !== null &&
    typeof (record.periodDetected as Record<string, unknown>).year === "number" &&
    typeof (record.periodDetected as Record<string, unknown>).month === "number"
      ? record.periodDetected
      : null;
  const unmappedColumns = Array.isArray(record.unmappedColumns) ? record.unmappedColumns : [];

  return { ...record, mappings, questions, ignoreReason, dateColumnName, periodDetected, unmappedColumns };
}

function parseJsonContent(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) throw new Error("Falco n'a pas retourné un mapping JSON exploitable.");
    try {
      return JSON.parse(fenced);
    } catch {
      throw new Error("Falco n'a pas retourné un mapping JSON exploitable.");
    }
  }
}

function finalizeMapping(input: unknown, unit: MappableUnit, options?: ImportMappingOptions): ImportMappingResult {
  const parsedResult = modelMappingSchema.safeParse(normalizeModelInput(input));
  if (!parsedResult.success) {
    throw new Error(`Mapping invalide retourné par le modèle : ${parsedResult.error.message}`);
  }

  const resultWithSheetName: ImportMappingResult = {
    ...parsedResult.data,
    // sheetName attached here, in code — never trusted from the model
    // (see ImportMappingResult's own comment in lib/import/schema.ts).
    sheetName: unitLabel(unit),
  };
  const constrainedResult = repairCrmMapping(applyImportTargetHint(resultWithSheetName, options), unit, options);
  const allowedFields = new Set(options?.targetTableHint === "crm_leads" ? CRM_IMPORT_FIELDS : DATA_IMPORT_FIELDS);
  const safeMappings = constrainedResult.mappings
    .filter((mapping) => !looksLikeRateColumn(mapping.sampleValues))
    .map((mapping) => (mapping.targetField && !allowedFields.has(mapping.targetField) ? { ...mapping, targetField: null } : mapping));
  const safeQuestions = constrainedResult.questions.map((question) => ({
    ...question,
    options: question.options.filter((option) => allowedFields.has(option)).slice(0, 3),
  }));

  return { ...constrainedResult, mappings: safeMappings, questions: safeQuestions };
}

export type MapImportedFileResult = {
  result: ImportMappingResult;
  inputTokens: number;
  outputTokens: number;
};

function buildSystemPrompt(options?: ImportMappingOptions): string {
  if (options?.targetTableHint === "crm_leads") {
    return [
      SYSTEM_PROMPT,
      "",
      'Contexte supplémentaire : cet import vient du CRM et doit reprendre un historique de leads, ligne par ligne. Choisis targetTable = "crm_leads" pour une feuille qui contient des prospects, ou "ignore" si elle ne contient pas de fiches de leads.',
      "- Une feuille avec des téléphones, des emails ou des URLs de profil et des noms est une liste de leads même si le canal d'acquisition ou la date de création manquent : garde targetTable = \"crm_leads\" et laisse l'interface demander le canal manquant.",
      "- Utilise uniquement les champs crm_leads décrits ci-dessus. Ne mappe jamais une plateforme comme source d'acquisition : platform décrit le réseau du profil et source décrit l'origine marketing du lead.",
      "- Cherche en priorité une colonne de téléphone, une colonne de date de création du lead et une colonne de source d'acquisition. Si la source n'est pas identifiable, laisse les colonnes ambiguës sans targetField : l'interface demandera un canal par feuille.",
      "- leadCreatedAt est la date historique de création du lead, pas la date d'import dans Minaly. Ne déduis aucune date d'événement absente du fichier.",
      "- Une colonne intitulée Dernière MAJ peut seulement être une proposition faible pour leadCreatedAt : ne la considère jamais comme certaine. Une colonne de texte comme Premier message WhatsApp ou Dernière interaction ne doit jamais être mappée vers un champ de date.",
      "- Ne mappe qu'une seule colonne vers chaque champ CRM. Pour les colonnes de statut, utilise Suivi pour stage et Résultat/Segment pour outcome seulement si les valeurs correspondent aux statuts CRM ou à leurs traductions évidentes.",
      "- Les colonnes de taux, ratio ou agrégats ne sont pas des fiches de leads : laisse-les sans targetField et explique-le dans unmapped_columns.",
      "- Ne pré-agrège jamais, ne dédoublonne jamais et ne fusionne jamais les lignes : le code et la revue utilisateur s'en chargent avec le téléphone normalisé.",
    ].join("\n");
  }
  if (options?.targetTableHint !== "monthly_metrics") return SYSTEM_PROMPT;

  const period = options.targetPeriod ? ` La période ouverte dans la popup est ${String(options.targetPeriod.month).padStart(2, "0")}/${options.targetPeriod.year}.` : "";
  return `${SYSTEM_PROMPT}

Contexte supplémentaire : cet import vient de la popup « chiffres du mois ». La priorité est de remplir les 9 champs monthly_metrics avec toute donnée qui ressemble sémantiquement à un KPI de funnel, même si les titres sont personnalisés, abrégés, dans une autre langue, placés au milieu d'un tableau ou précédés d'un titre décoratif.${period}
- Pour ce flux, choisis targetTable = "monthly_metrics" dès que tu peux relier une ou plusieurs colonnes à ces 9 KPI. N'utilise "ignore" que si le contenu ne contient réellement aucun chiffre de funnel.
- Ne te limite pas au nom des colonnes : utilise les intitulés, les valeurs, la structure, les unités (€/%/comptes) et les lignes voisines pour comprendre l'intention.
- Si aucune date exploitable n'est présente, utilise periodDetected uniquement si la période est explicite ; le code de la popup appliquera la période ouverte après revue.
- Une colonne ambiguë peut rester sans targetField et apparaître dans la revue, mais ne rejette pas toute la feuille pour cela.`;
}

// The only AI call in the import feature — deterministic parsing
// (lib/import/parse.ts) always runs first. `provider` comes from
// resolveFalcoProvider (lib/agent/falco-provider.ts), so the CRM import uses
// the same Falco/Groq fallback as the rest of the product.
export async function mapImportedFile(
  unit: MappableUnit,
  businessContext: string,
  provider: FalcoProvider,
  options?: ImportMappingOptions
): Promise<MapImportedFileResult> {
  const systemPrompt = `${buildSystemPrompt(options)}\n\nContexte business de l'utilisateur :\n${businessContext}\n\n${falcoLanguageInstruction(options?.locale ?? DEFAULT_LOCALE)}`;

  if (provider.kind === "groq") {
    const response = await requestFalcoJson(
      provider,
      `${systemPrompt}\n\nRetourne uniquement un objet JSON valide avec les clés targetTable, mappings, unmappedColumns et questions. N'utilise pas de markdown ni de bloc de code.`,
      buildTextContent(unit),
      0,
      MAX_TOKENS,
    );
    const responseText = await response.text();
    if (!response.ok) throw new Error(`L'IA a renvoyé une erreur (${response.status}).`);

    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      throw new Error("Falco a renvoyé une réponse JSON inexploitable.");
    }
    const parsedResponse = GROQ_MAPPING_RESPONSE_SCHEMA.safeParse(responseBody);
    if (!parsedResponse.success) throw new Error("Falco a renvoyé une réponse JSON inexploitable.");
    const content = parsedResponse.data.choices[0]?.message.content;
    if (!content) throw new Error("Falco n'a pas retourné de mapping.");

    return {
      result: finalizeMapping(parseJsonContent(content), unit, options),
      inputTokens: parsedResponse.data.usage?.prompt_tokens ?? 0,
      outputTokens: parsedResponse.data.usage?.completion_tokens ?? 0,
    };
  }

  const client = new Anthropic({ apiKey: provider.apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: [MAP_COLUMNS_TOOL],
      tool_choice: { type: "tool", name: "map_columns" },
      messages: [{ role: "user", content: buildFileContent(unit) }],
    });
  } catch (error) {
    // Turned into a clear, actionable message instead of leaking the raw
    // SDK error up through the generic "erreur inattendue" catch-all — the
    // most likely real-world cause (an invalid/expired BYOK key) deserves
    // its own wording, not a stack trace.
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("Ta clé Anthropic (BYOK) semble invalide ou expirée. Vérifie-la dans Réglages.");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("Limite de requêtes atteinte sur ta clé Anthropic. Réessaie dans un instant.");
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`L'IA a renvoyé une erreur (${error.status ?? "?"}) : ${error.message}`);
    }
    throw error;
  }

  const toolUseBlock = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUseBlock) {
    throw new Error("Le modèle n'a pas retourné de mapping structuré.");
  }

  return {
    // Never trust the model's declared tool schema compliance blindly —
    // re-validated with Zod here regardless (CLAUDE.md: no unvalidated `as`
    // on external input, and LLM output is external input).
    result: finalizeMapping(toolUseBlock.input, unit, options),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
