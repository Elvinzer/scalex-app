import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { track } from "@/lib/analytics";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { getAiProvider } from "@/lib/ai-provider";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { buildImprovePrompt, type ImproveMetricKey } from "@/lib/improve-prompt-builder";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 20;

const requestSchema = z.object({
  metricKey: z.enum([
    "responseRate",
    "proposalRate",
    "bookingRate",
    "showUpRate",
    "closingRate",
    "followupRecovery",
    "general",
  ]),
  followupKey: z.enum(["nonBuyers", "noShow", "failedPayments"]).nullable().optional(),
  period: z.enum(["3-months", "current-month", "12-months"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(MAX_MESSAGES),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
  }
  const userId = data.claims.sub as string;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { metricKey, followupKey, period, messages } = parsed.data;

  // "messages" already includes the just-submitted user message (see
  // components/improve-chat.tsx's handleSubmit) — so this request IS the
  // 3rd user message exactly once, when the count first reaches 3.
  if (messages.filter((m) => m.role === "user").length === 3) {
    await track("improve_chat_engaged", userId);
  }

  if (messages.length >= MAX_MESSAGES) {
    return NextResponse.json(
      { error: "Cette conversation a atteint sa limite de messages — ouvre-la à nouveau pour continuer." },
      { status: 400 }
    );
  }

  // Server always recomputes the numbers from the authenticated user's own
  // data — never trusts a client-sent rate/€ figure, same rule as
  // lib/agent/insight.ts.
  const [[userRow], businessProfile, allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    getBusinessProfile(userId),
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(userId),
  ]);

  const months = period === "current-month" ? [currentMonthWindow()] : lastCompletedMonths(period === "12-months" ? 12 : 3);
  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });

  const benchmarks = await getDiagnosticBenchmarks(userRow?.sector ?? null);
  const points = computeDiagnosticPoints({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
  });

  const point = metricKey === "followupRecovery" ? null : (points.find((p) => p.key === metricKey) ?? null);
  const followup =
    metricKey === "followupRecovery" && followupKey
      ? (computeFollowupCompliance(businessProfile).find((f) => f.key === followupKey) ?? null)
      : null;

  const systemPrompt = buildImprovePrompt({
    metricKey: metricKey as ImproveMetricKey,
    businessProfile,
    settingTotals,
    closingTotals,
    point,
    points: metricKey === "general" ? points.slice(0, 3) : undefined,
    followup,
  });

  let provider;
  try {
    provider = getAiProvider();
  } catch {
    return NextResponse.json(
      { error: "L'IA n'est pas configurée côté serveur — préviens l'administrateur." },
      { status: 503 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(provider.baseURL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        stream: true,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre l'IA pour l'instant — réessaie dans un instant." },
      { status: 502 }
    );
  }

  if (upstream.status === 429) {
    return NextResponse.json(
      { error: "Beaucoup de monde utilise l'IA en ce moment, réessaie dans une minute." },
      { status: 429 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "L'IA n'a pas pu répondre — réessaie dans un instant." }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
