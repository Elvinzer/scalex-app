import Anthropic from "@anthropic-ai/sdk";

import { ALL_TARGET_FIELDS, IMPORT_TARGET_TABLES, importMappingResultSchema, type ImportMappingResult } from "@/lib/import/schema";
import type { ParsedFile } from "@/lib/import/parse";

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

Champs "content_posts" (seulement si le fichier est manifestement une liste de posts/contenus) :
platform, type (post|reel|story|video|live), title, publishedAt, url, views, likes, comments, shares, clicks, leads

Champs "sales" (seulement si le fichier est manifestement une liste de ventes/clients) :
clientName, clientEmail, sourceChannel, totalPrice (euros), paymentType (one_shot|installments), saleDate, closer`;

const SYSTEM_PROMPT = `Tu es l'agent d'import de données de Scale X, un SaaS pour infopreneurs.
On te donne un fichier (tableau ou texte extrait) et tu dois le mapper vers les champs existants de l'app via l'outil map_columns.

Règles absolues, non négociables :
- Une seule table cible par fichier (targetTable) : "monthly_metrics" par défaut, "content_posts" ou "sales" seulement si le fichier correspond manifestement à ça.
- Ne JAMAIS mapper une colonne de taux/pourcentage/ratio — ces valeurs sont toujours recalculées par l'app, jamais importées. Mets cette colonne dans unmapped_columns avec l'explication.
- Ne JAMAIS inventer une valeur qui n'est pas explicitement dans le fichier.
- confidence "high" seulement si le nom de colonne et les valeurs échantillon ne laissent aucun doute. Sinon "medium" ou "low", et ajoute une question dans "questions" (max 6 questions au total — au-delà, laisse la colonne en unmapped plutôt que de rajouter une question).
- Chaque question doit citer 2-3 échantillons concrets de la colonne et proposer 2-3 champs cibles plausibles en options (jamais plus de 3).
- Si le fichier ne précise pas de mois/année, periodDetected doit être null (ne devine jamais une période).

${FIELD_DEFINITIONS}`;

const MAP_COLUMNS_TOOL: Anthropic.Tool = {
  name: "map_columns",
  description: "Retourne le mapping des colonnes du fichier vers les champs cibles de Scale X.",
  input_schema: {
    type: "object",
    properties: {
      targetTable: { type: "string", enum: [...IMPORT_TARGET_TABLES] },
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
    required: ["targetTable", "mappings", "periodDetected", "unmappedColumns", "questions"],
  },
};

function buildFileContent(parsed: ParsedFile): Anthropic.ContentBlockParam[] {
  if (parsed.kind === "image") {
    return [
      {
        type: "image",
        source: { type: "base64", media_type: parsed.mediaType as "image/png" | "image/jpeg", data: parsed.base64 },
      },
      { type: "text", text: `Capture/image "${parsed.fileName}". Extrait un tableau structuré équivalent puis mappe-le.` },
    ];
  }
  if (parsed.kind === "text") {
    return [{ type: "text", text: `Fichier PDF "${parsed.fileName}" (texte extrait) :\n\n${parsed.text.slice(0, MAX_PDF_CHARS_SENT_TO_MODEL)}` }];
  }
  const sheetsText = parsed.sheets
    .map(
      (sheet) =>
        `Feuille "${sheet.name}" — colonnes : ${sheet.headers.join(" | ")}\n` +
        sheet.rows
          .slice(0, MAX_ROWS_SENT_TO_MODEL)
          .map((row) => row.join(" | "))
          .join("\n")
    )
    .join("\n\n");
  return [{ type: "text", text: `Fichier "${parsed.fileName}" :\n\n${sheetsText}` }];
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
export async function mapImportedFile(parsed: ParsedFile, businessContext: string, apiKey: string): Promise<MapImportedFileResult> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: `${SYSTEM_PROMPT}\n\nContexte business de l'utilisateur :\n${businessContext}`,
    tools: [MAP_COLUMNS_TOOL],
    tool_choice: { type: "tool", name: "map_columns" },
    messages: [{ role: "user", content: buildFileContent(parsed) }],
  });

  const toolUseBlock = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUseBlock) {
    throw new Error("Le modèle n'a pas retourné de mapping structuré.");
  }

  // Never trust the model's declared tool schema compliance blindly —
  // re-validated with Zod here regardless (CLAUDE.md: no unvalidated `as`
  // on external input, and LLM output is external input).
  const parsedResult = importMappingResultSchema.safeParse(toolUseBlock.input);
  if (!parsedResult.success) {
    throw new Error(`Mapping invalide retourné par le modèle : ${parsedResult.error.message}`);
  }

  const safeMappings = parsedResult.data.mappings.filter((mapping) => !looksLikeRateColumn(mapping.sampleValues));

  return {
    result: { ...parsedResult.data, mappings: safeMappings },
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
