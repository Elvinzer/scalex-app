import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { resolveAgentKey } from "@/lib/agent/client";
import { mapImportedFile, type MappableUnit } from "@/lib/agent/import-mapping";
import { getBusinessProfile } from "@/lib/business/queries";
import { db } from "@/db";
import { monthlyMetrics, users } from "@/db/schema";
import { enrichMapping, groupValuesByMonth } from "@/lib/import/aggregate";
import { ImportParseError, MAX_FILES_PER_IMPORT, parseImportFile, type ParsedFile } from "@/lib/import/parse";
import type { AnalyzeSheetResult } from "@/lib/import/schema";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

function buildBusinessContext(businessProfile: Awaited<ReturnType<typeof getBusinessProfile>>): string {
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);
  const lines = [
    `Business : ${businessProfile.identity.businessName || "(non renseigné)"}, niche : ${businessProfile.identity.niche || "(non renseignée)"}.`,
  ];
  if (mainOffer) {
    lines.push(`Offre principale : "${mainOffer.name || "sans nom"}" à ${mainOffer.price ?? "?"}€.`);
  }
  return lines.join("\n");
}

// A table-kind file becomes one mappable unit PER SHEET (each sheet gets
// its own independent targetTable/ignore decision) — text/image files have
// no sheet concept and stay a single unit.
function unitsForFile(parsed: ParsedFile): MappableUnit[] {
  if (parsed.kind === "table") {
    return parsed.sheets.map((sheet) => ({ kind: "sheet" as const, fileName: parsed.fileName, sheet }));
  }
  if (parsed.kind === "text") return [{ kind: "text", fileName: parsed.fileName, text: parsed.text }];
  return [{ kind: "image", fileName: parsed.fileName, base64: parsed.base64, mediaType: parsed.mediaType }];
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
  }
  const userId = data.claims.sub as string;
  const access = await requirePermission(userId, "datas");
  if (!access) {
    return NextResponse.json({ error: "Tu n'as pas accès à cette section." }, { status: 403 });
  }
  const { accountId } = access;

  const formData = await request.formData();
  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  // Set when the user already answered "which line is your header row?"
  // for a sheet on a prior call to this same route — re-parses with the
  // chosen row instead of re-running detectHeaderRow.
  const headerOverridesRaw = formData.get("headerOverrides");
  let headerOverrides: Record<string, number> | undefined;
  if (typeof headerOverridesRaw === "string") {
    try {
      headerOverrides = JSON.parse(headerOverridesRaw);
    } catch {
      // Malformed override payload — ignored, falls back to normal detection.
    }
  }

  if (files.length === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (files.length > MAX_FILES_PER_IMPORT) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES_PER_IMPORT} fichiers par import.` }, { status: 400 });
  }

  const [accountRow] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  if (!accountRow) {
    return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  }

  const [{ apiKey, source: keySource }, businessProfile] = await Promise.all([
    resolveAgentKey(accountRow),
    getBusinessProfile(accountId),
  ]);
  const businessContext = buildBusinessContext(businessProfile);

  const results: AnalyzeSheetResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const file of files) {
    let buffer: Buffer;
    let parsed: ParsedFile;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
      parsed = await parseImportFile(file.name, buffer, headerOverrides);
    } catch (error) {
      if (error instanceof ImportParseError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error("Import parse failed", file.name, error);
      return NextResponse.json(
        { error: `Une erreur inattendue est survenue en analysant ${file.name}. Réessaie, ou contacte le support si ça persiste.` },
        { status: 500 }
      );
    }

    const fileHash = createHash("sha256").update(buffer).digest("hex");

    for (const unit of unitsForFile(parsed)) {
      try {
        const { result, inputTokens, outputTokens } = await mapImportedFile(unit, businessContext, apiKey);
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        // "ad_campaigns" is never silent, regardless of the model's own
        // confidence — a code-injected confirmation question, not left to
        // the model to decide whether to ask (per the fix's non-negotiable
        // rule: Ads targeting always asks, never auto-commits).
        const questions =
          result.targetTable === "ad_campaigns"
            ? [
                {
                  sourceColumn: "__ad_campaigns_confirm__",
                  prompt: `Ta feuille "${result.sheetName}" ressemble à du tracking de pub. Je l'importe dans ton module Ads, ou je l'ignore ?`,
                  options: [] as string[],
                },
                ...result.questions,
              ]
            : result.questions;

        const sheet = unit.kind === "sheet" ? unit.sheet : null;
        results.push({
          fileName: file.name,
          sheetName: result.sheetName,
          fileHash,
          headerRowConfident: sheet?.headerRowConfident ?? true,
          previewRows: sheet?.previewRows ?? [],
          mapping: enrichMapping(parsed, { ...result, questions }),
        });
      } catch (error) {
        console.error("Import mapping failed", file.name, unit.kind === "sheet" ? unit.sheet.name : unit.fileName, error);
        return NextResponse.json(
          { error: `Une erreur inattendue est survenue en analysant ${file.name}. Réessaie, ou contacte le support si ça persiste.` },
          { status: 500 }
        );
      }
    }
  }

  // Existing monthly_metrics values for every month detected across the
  // batch (via dateColumnValues when present, else the single
  // periodDetected fallback) — sent back so the client preview can show
  // conflicts without a second round-trip.
  const detectedMonths = new Map<string, { year: number; month: number }>();
  for (const r of results) {
    const buckets = r.mapping.dateColumnValues ? groupValuesByMonth(r.mapping.dateColumnValues) : null;
    if (buckets) {
      for (const b of buckets) detectedMonths.set(`${b.year}-${b.month}`, { year: b.year, month: b.month });
    } else if (r.mapping.periodDetected) {
      const p = r.mapping.periodDetected;
      detectedMonths.set(`${p.year}-${p.month}`, p);
    }
  }
  const existingMonths: Record<string, unknown> = {};
  for (const [key, { year, month }] of detectedMonths) {
    const [row] = await db
      .select()
      .from(monthlyMetrics)
      .where(and(eq(monthlyMetrics.userId, accountId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
      .limit(1);
    existingMonths[key] = row ?? null;
  }

  return NextResponse.json({
    sheets: results,
    existingMonths,
    keySource,
    tokens: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  });
}
