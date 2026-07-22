import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { resolveAgentKey } from "@/lib/agent/client";
import { mapImportedFile } from "@/lib/agent/import-mapping";
import { getBusinessProfile } from "@/lib/business/queries";
import { db } from "@/db";
import { monthlyMetrics, users } from "@/db/schema";
import { enrichMapping } from "@/lib/import/aggregate";
import { ImportParseError, MAX_FILES_PER_IMPORT, parseImportFile } from "@/lib/import/parse";
import type { AnalyzeFileResult } from "@/lib/import/schema";
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

  const results: AnalyzeFileResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parsed = await parseImportFile(file.name, buffer);
      const fileHash = createHash("sha256").update(buffer).digest("hex");

      const { result, inputTokens, outputTokens } = await mapImportedFile(parsed, businessContext, apiKey);
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      results.push({ fileName: file.name, fileHash, mapping: enrichMapping(parsed, result) });
    } catch (error) {
      if (error instanceof ImportParseError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      console.error("Import analyze failed", file.name, error);
      return NextResponse.json({ error: `Impossible d'analyser ${file.name}.` }, { status: 500 });
    }
  }

  // Existing monthly_metrics values for every month detected across the
  // batch — sent back so the client preview can show conflicts without a
  // second round-trip.
  const detectedMonths = results
    .map((r) => r.mapping.periodDetected)
    .filter((p): p is { year: number; month: number } => p !== null);
  const existingMonths: Record<string, unknown> = {};
  for (const { year, month } of detectedMonths) {
    const key = `${year}-${month}`;
    if (key in existingMonths) continue;
    const [row] = await db
      .select()
      .from(monthlyMetrics)
      .where(and(eq(monthlyMetrics.userId, accountId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
      .limit(1);
    existingMonths[key] = row ?? null;
  }

  return NextResponse.json({
    files: results,
    existingMonths,
    keySource,
    tokens: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  });
}
