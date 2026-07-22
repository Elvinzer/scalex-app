import Anthropic from "@anthropic-ai/sdk";

import { ALL_TARGET_FIELDS, IMPORT_TARGET_TABLES, modelMappingSchema, type ImportMappingResult } from "@/lib/import/schema";
import type { RawSheet } from "@/lib/import/parse";

// Bump here when the model needs updating — single point of change, same
// convention as lib/agent/insight.ts.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4000;
const MAX_ROWS_SENT_TO_MODEL = 50; // sample only — never the full 2000-row cap, keeps tokens sane
const MAX_PDF_CHARS_SENT_TO_MODEL = 20_000;

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

Champs "content_posts" (seulement si la feuille est manifestement une liste de posts/contenus) :
platform, type (post|reel|story|video|live), title, publishedAt, url, views, likes, comments, shares, clicks, leads

Champs "sales" (seulement si la feuille est manifestement une liste de ventes/clients) :
clientName, clientEmail, sourceChannel, totalPrice (euros), paymentType (one_shot|installments), saleDate, closer

Champs "ad_campaigns" (seulement si la feuille est manifestement du tracking de publicité payante) :
campaignName, spend (euros dépensés), impressions, clicks, leads`;

const SYSTEM_PROMPT = `Tu es l'agent d'import de données de Scale X, un SaaS pour infopreneurs.
On te donne UNE feuille/fichier (tableau ou texte extrait) à la fois et tu dois la mapper vers les champs existants de l'app via l'outil map_columns.

Règles absolues, non négociables :
- Une seule table cible (targetTable) par feuille : "monthly_metrics", "content_posts", "sales", "ad_campaigns", ou "ignore" si rien ne correspond manifestement (données de tiers/veille concurrentielle, notes libres, feuille de calcul annexe...).
- "ignore" exige TOUJOURS un ignoreReason concret et court (ex: "Données de veille sur des comptes concurrents, pas tes métriques.") — jamais vide, jamais générique.
- Ne JAMAIS mapper une colonne de taux/pourcentage/ratio — ces valeurs sont toujours recalculées par l'app, jamais importées. Mets cette colonne dans unmapped_columns avec l'explication.
- Ne JAMAIS inventer une valeur qui n'est pas explicitement dans le fichier.
- confidence "high" seulement si le nom de colonne et les valeurs échantillon ne laissent aucun doute. Sinon "medium" ou "low", et ajoute une question dans "questions" (max 6 questions au total — au-delà, laisse la colonne en unmapped plutôt que de rajouter une question).
- Chaque question doit citer 2-3 échantillons concrets de la colonne et proposer 2-3 champs cibles plausibles en options (jamais plus de 3).
- dateColumnName : le nom EXACT (tel qu'il apparaît dans les colonnes) de la colonne qui contient une date par ligne, s'il y en a une — sert à regrouper les lignes par mois EN CODE (jamais toi qui comptes/additionnes). null si aucune colonne date exploitable.
- Si aucune colonne date n'existe et qu'aucune période ne peut être déduite du fichier, periodDetected doit être null (ne devine jamais une période) — periodDetected ne sert que de repli quand dateColumnName est null.

${FIELD_DEFINITIONS}`;

const MAP_COLUMNS_TOOL: Anthropic.Tool = {
  name: "map_columns",
  description: "Retourne le mapping des colonnes d'une feuille vers les champs cibles de Scale X.",
  input_schema: {
    type: "object",
    properties: {
      targetTable: { type: "string", enum: [...IMPORT_TARGET_TABLES] },
      ignoreReason: { type: ["string", "null"] },
      mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceColumn: { type: "string" },
            targetField: { type: ["string", "null"], enum: [...ALL_TARGET_FIELDS, null] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            granularity: { type: "string", enum: ["daily", "weekly", "monthly"] },
            sampleValues: { type: "array", items: { type: "string" } },
          },
          required: ["sourceColumn", "targetField", "confidence", "granularity", "sampleValues"],
        },
      },
      dateColumnName: { type: ["string", "null"] },
      periodDetected: {
        type: ["object", "null"],
        properties: { year: { type: "number" }, month: { type: "number" } },
      },
      unmappedColumns: { type: "array", items: { type: "string" } },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sourceColumn: { type: "string" },
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string" } },
          },
          required: ["sourceColumn", "prompt", "options"],
        },
      },
    },
    required: ["targetTable", "ignoreReason", "mappings", "dateColumnName", "periodDetected", "unmappedColumns", "questions"],
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

function unitLabel(unit: MappableUnit): string {
  return unit.kind === "sheet" ? unit.sheet.name : unit.fileName;
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

// Rate/percentage columns must never be imported (CLAUDE.md: recalculated
// in code, never pre-aggregated by the LLM) — enforced here as a
// deterministic safety net IN ADDITION to the prompt instruction, in case
// the model maps one anyway.
function looksLikeRateColumn(sampleValues: string[]): boolean {
  const nonEmpty = sampleValues.map((v) => v.trim()).filter(Boolean);
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => /%\s*$/.test(v) || /^0?[.,]\d+$/.test(v));
}

export type MapImportedFileResult = {
  result: ImportMappingResult;
  inputTokens: number;
  outputTokens: number;
};

// The only AI call in the import feature — deterministic parsing
// (lib/import/parse.ts) always runs first. `apiKey` comes from
// resolveAgentKey (lib/agent/client.ts), same BYOK-first/shared-fallback
// resolution as every other agent call.
export async function mapImportedFile(unit: MappableUnit, businessContext: string, apiKey: string): Promise<MapImportedFileResult> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: `${SYSTEM_PROMPT}\n\nContexte business de l'utilisateur :\n${businessContext}`,
    tools: [MAP_COLUMNS_TOOL],
    tool_choice: { type: "tool", name: "map_columns" },
    messages: [{ role: "user", content: buildFileContent(unit) }],
  });

  const toolUseBlock = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUseBlock) {
    throw new Error("Le modèle n'a pas retourné de mapping structuré.");
  }

  // Never trust the model's declared tool schema compliance blindly —
  // re-validated with Zod here regardless (CLAUDE.md: no unvalidated `as`
  // on external input, and LLM output is external input).
  const parsedResult = modelMappingSchema.safeParse(toolUseBlock.input);
  if (!parsedResult.success) {
    throw new Error(`Mapping invalide retourné par le modèle : ${parsedResult.error.message}`);
  }

  const safeMappings = parsedResult.data.mappings.filter((mapping) => !looksLikeRateColumn(mapping.sampleValues));

  return {
    // sheetName attached here, in code — never trusted from the model
    // (see ImportMappingResult's own comment in lib/import/schema.ts).
    result: { ...parsedResult.data, mappings: safeMappings, sheetName: unitLabel(unit) },
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
