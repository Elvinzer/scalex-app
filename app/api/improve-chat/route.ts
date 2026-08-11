import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AGENT_KEY_CONSOLIDATION } from "@/lib/agent/agent-consolidation";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { appendConversationMessage, getConversation, titleFor, updateConversationTitle } from "@/lib/agent/chat-history";
import { requestFalcoStream, resolveFalcoProvider, transformAnthropicStream } from "@/lib/agent/falco-provider";
import { resolveLeverAgentData } from "@/lib/agent/lever-agent-data";
import { resolvePageAgentData } from "@/lib/agent/page-agent-data";
import { getPageContextByKey } from "@/lib/agent/page-context";
import { createSseAccumulatorStream } from "@/lib/agent/sse-accumulator";
import { extractFalcoInsightEvent } from "@/lib/agent/falco-insight-proposal";
import { track } from "@/lib/analytics";
import { db } from "@/db";
import { users } from "@/db/schema";
import { chatContextSchema, type ChatContext } from "@/lib/chat-context";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeContentRetentionSummary } from "@/lib/diagnostic/content-retention";
import { formatUnifiedSourceContext } from "@/lib/diagnostic/unified-context";
import { buildImprovePrompt, type LeverMode } from "@/lib/improve-prompt-builder";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";
import { getContentRecommendation, getWinningPatterns } from "@/lib/youtube/recommendations";
import type { YoutubeWinningPatternsSnapshot } from "@/lib/youtube/recommendation-types";

const MAX_MESSAGES = 20;

const METRIC_TOPIC_KEYS = ["responseRate", "proposalRate", "bookingRate", "showUpRate", "closingRate", "followupRecovery"] as const;

function providerErrorMessage(provider: "anthropic" | "groq", status: number): string {
  if (status === 401 || status === 403) {
    return provider === "anthropic"
      ? "La clé Anthropic de ce compte n'est pas acceptée. Vérifie-la dans Réglages."
      : "Le fournisseur IA est inaccessible. Vérifie la configuration Groq côté serveur.";
  }
  if (status === 429) return "La limite de requêtes IA est atteinte. Réessaie dans un instant.";
  return "L'IA n'a pas pu répondre pour l'instant. Réessaie dans un instant.";
}

const requestSchema = z.object({
  context: chatContextSchema,
  followupKey: z.enum(["nonBuyers", "noShow", "failedPayments"]).nullable().optional(),
  period: z.enum(["3-months", "current-month", "12-months"]),
  mode: z.enum(["optimiser", "demarrer", "decouverte"]).nullable().optional(),
  // Required whenever topicType !== "metric" — the client always resolves
  // this BEFORE calling here (AgentChatThread's mount effect, via
  // findOrCreateConversationForTopic/startNewConversation), never invented
  // here. "metric" topics have no conversation at all (fully ephemeral,
  // unchanged from before).
  conversationId: z.string().uuid().optional(),
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
  // Per-user, not per-IP: an LLM call, so the thing worth protecting is the
  // server's shared upstream key/quota, not just request volume.
  if (isRateLimited(`improve-chat:${userId}`, 20)) {
    return NextResponse.json({ error: "Trop de messages envoyés, réessaie dans une minute." }, { status: 429 });
  }
  const access = await requirePermission(userId, "diagnostic");
  if (!access) {
    return NextResponse.json({ error: "Tu n'as pas accès à cette section." }, { status: 403 });
  }
  const { accountId } = access;

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { context: clientContext, followupKey, period, mode, messages, conversationId } = parsed.data;

  // Every persisted topic (anything but "metric") must already have a real
  // conversation row by the time it reaches here — never created on the fly
  // from unvalidated client input. The conversation's OWN stored topic
  // fields are authoritative from here on (never the client-sent ones),
  // same "don't trust the client" rule as the rest of this route already
  // follows for numbers/gains.
  let conversation: Awaited<ReturnType<typeof getConversation>> = null;
  if (clientContext.topicType !== "metric") {
    if (!conversationId) {
      return NextResponse.json({ error: "Conversation manquante. Recharge la page." }, { status: 400 });
    }
    conversation = await getConversation(accountId, conversationId);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation introuvable. Recharge la page." }, { status: 400 });
    }
  }
  const context: ChatContext = conversation
    ? { topicType: conversation.topicType, topicKey: conversation.topicKey, topicLabel: conversation.topicLabel, sourcePage: clientContext.sourcePage }
    : clientContext;

  // "messages" already includes the just-submitted user message (see
  // components/improve-chat.tsx's handleSubmit) — so this request IS the
  // 3rd user message exactly once, when the count first reaches 3.
  if (messages.filter((m) => m.role === "user").length === 3) {
    await track("improve_chat_engaged", userId);
    if (context.topicType === "lever" && context.topicKey) {
      await track("agent_chat_engaged", userId, { agent_key: context.topicKey });
    }
  }

  if (messages.length >= MAX_MESSAGES) {
    return NextResponse.json(
      { error: "Cette conversation a atteint sa limite de messages. Ouvre-la à nouveau pour continuer." },
      { status: 400 }
    );
  }

  // Server always recomputes the numbers from the authenticated user's own
  // data — never trusts a client-sent rate/€ figure, same rule as
  // lib/agent/insight.ts. `agent` is the single unified Falco row (identity/
  // prompt/temperature) — always fetched, regardless of topicType.
  const [[userRow], businessProfile, rawData, agent] = await Promise.all([
    db.select().from(users).where(eq(users.id, accountId)).limit(1),
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getAgentByKey("falco"),
  ]);

  const months = period === "current-month" ? [currentMonthWindow()] : lastCompletedMonths(period === "12-months" ? 12 : 3);
  const { settingTotals, closingTotals, cashContractedTotal, pipelineTotals, acquisitionTotals } = aggregatePeriodTotals({
    months,
    allMonthlyRows: rawData.allMonthlyRows,
    allSettingEntries: rawData.allSettingEntries,
    allClosingEntries: rawData.allClosingEntries,
    callSourcesByMonth: rawData.allCallSourcesByMonth,
    allSales: rawData.allSales,
    allLeads: rawData.allLeads,
    allLeadStageHistory: rawData.allLeadStageHistory,
    allEmailCampaigns: rawData.allEmailCampaigns,
    allMetaMetrics: rawData.allMetaMetrics,
    allNativeBookingLeads: rawData.allNativeBookingLeads,
  });
  const retention = computeContentRetentionSummary({
    months,
    youtubeVideos: rawData.allYoutubeVideoInsights,
    instagramPosts: rawData.allInstagramPostInsights,
  });
  const unifiedSourceContext = formatUnifiedSourceContext({
    periodLabel: period === "current-month" ? "mois en cours" : `${months.length} mois terminés`,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    pipelineTotals,
    acquisitionTotals,
    retention,
  });

  // Falco addresses the PERSON, so the name comes from the logged-in user's
  // own row: users.displayName is personal (/settings' updateProfile writes
  // it to claims.sub), while userRow above is the account owner's row. Same
  // row for an owner, so this costs nothing in the common case.
  const [currentUserRow] =
    userId === accountId ? [userRow] : await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userName = currentUserRow?.displayName?.trim() || null;

  let falcoProvider: Awaited<ReturnType<typeof resolveFalcoProvider>>;
  try {
    const falcoUser = currentUserRow ?? userRow;
    if (!falcoUser) {
      return NextResponse.json({ error: "Compte utilisateur introuvable. Recharge la page." }, { status: 400 });
    }
    falcoProvider = await resolveFalcoProvider({
      id: falcoUser.id,
      anthropicApiKeyEncrypted: falcoUser.anthropicApiKeyEncrypted,
    });
  } catch (error) {
    console.error("[improve-chat] Falco provider resolution failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "L'IA n'est pas configurée. Ajoute une clé Anthropic dans Réglages ou contacte l'administrateur." },
      { status: 503 }
    );
  }

  const benchmarks = await getDiagnosticBenchmarks(userRow?.sector ?? null);
  const points = computeDiagnosticPoints({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
  });

  // No silent fallback to "general" when a specific topic was requested —
  // this is the actual fix for the generic-response bug (a missing/
  // unresolvable topic used to just render the generic prompt). An
  // explicit rejection surfaces the real problem (stale page, bad deep
  // link, resolved/removed lever) instead of masking it as a normal reply.
  let point = null as ReturnType<typeof computeDiagnosticPoints>[number] | null;
  let followup = null as ReturnType<typeof computeFollowupCompliance>[number] | null;
  let leverAgentData: Awaited<ReturnType<typeof resolveLeverAgentData>> = null;
  let leverMode: LeverMode | null = null;
  let contentRecommendation: Awaited<ReturnType<typeof getContentRecommendation>> = null;
  let contentWinningPatterns: YoutubeWinningPatternsSnapshot | null = null;

  if (context.topicType === "metric") {
    if (!context.topicKey || !(METRIC_TOPIC_KEYS as readonly string[]).includes(context.topicKey)) {
      return NextResponse.json({ error: "Sujet invalide. Recharge la page." }, { status: 400 });
    }
    if (context.topicKey === "followupRecovery") {
      followup = followupKey ? (computeFollowupCompliance(businessProfile).find((f) => f.key === followupKey) ?? null) : null;
      if (!followup) {
        return NextResponse.json({ error: "Relance introuvable. Recharge la page." }, { status: 400 });
      }
    } else {
      point = points.find((p) => p.key === context.topicKey) ?? null;
      if (!point) {
        return NextResponse.json({ error: "Ce point n'est plus mesurable avec tes données actuelles. Recharge la page." }, { status: 400 });
      }
    }
  }

  if (context.topicType === "lever") {
    if (!context.topicKey) {
      return NextResponse.json({ error: "Sujet invalide. Recharge la page." }, { status: 400 });
    }
    // Identity is always Falco now — this only picks which business DATA
    // block to inject (lib/agent/lever-agent-data.ts), same consolidation
    // table that used to ALSO pick which agent persona answered.
    const dataBucketKey = AGENT_KEY_CONSOLIDATION[context.topicKey] ?? context.topicKey;
    leverAgentData = await resolveLeverAgentData(dataBucketKey, {
      accountId,
      businessProfile,
      settingTotals,
      closingTotals,
      cashContractedTotal,
      periodMonths: months.length,
      months,
      points,
      sector: userRow?.sector ?? null,
    });
    if (!leverAgentData) {
      return NextResponse.json({ error: "Ce levier est introuvable. Recharge la page." }, { status: 400 });
    }
    leverMode = mode ?? "optimiser";
  }

  if (context.topicType === "content_idea") {
    if (!context.topicKey) {
      return NextResponse.json({ error: "Recommandation manquante. Recharge la page." }, { status: 400 });
    }
    contentRecommendation = await getContentRecommendation(accountId, context.topicKey);
    if (!contentRecommendation) {
      return NextResponse.json({ error: "Cette recommandation n'est plus disponible. Recharge la page." }, { status: 400 });
    }
    const patternRow = await getWinningPatterns(accountId);
    contentWinningPatterns = patternRow
      ? {
          themes: patternRow.themes,
          formats: patternRow.formats,
          titleStructures: patternRow.titleStructures,
          angles: patternRow.angles,
          topVideoIds: patternRow.topVideoIds,
          analyzedVideoCount: patternRow.analyzedVideoCount,
        }
      : null;
  }

  // Page hook — only for the floating bubble ("general"), which is the one
  // entry point with no topic of its own. sourcePage is the sole client-sent
  // field not overwritten by the conversation row above, so it's what
  // carries the page identity. Failing to resolve the page data is never
  // fatal: the prompt just falls back to the generic general opening.
  const pageContext = context.topicType === "general" ? getPageContextByKey(context.sourcePage) : null;
  let pageAgentData: Awaited<ReturnType<typeof resolvePageAgentData>> = null;
  if (pageContext) {
    try {
      pageAgentData = await resolvePageAgentData(pageContext, {
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: months.length,
        months,
        points,
        sector: userRow?.sector ?? null,
      });
    } catch (error) {
      console.error(`[improve-chat] page data for ${pageContext.pageKey} failed, continuing without it`, error);
    }
  }

  const systemPrompt = buildImprovePrompt({
    context,
    businessProfile,
    settingTotals,
    closingTotals,
    point,
    points: context.topicType === "general" ? points.slice(0, 3) : undefined,
    followup,
    agent,
    leverAgentData,
    mode: leverMode,
    pageContext,
    pageAgentData,
    userName,
    contentRecommendation,
    winningPatterns: contentWinningPatterns,
    unifiedSourceContext,
  });

  // "messages" already includes the just-submitted user message — nothing
  // to persist on the very first call, which opens with an empty array.
  const lastMessage = messages[messages.length - 1];
  if (conversation && lastMessage?.role === "user") {
    await appendConversationMessage(accountId, conversation.id, "user", lastMessage.content);
    // Title stored once, right when the FIRST real exchange happens (not
    // the automatic opening greeting, which sends an empty history) — see
    // lib/agent/chat-history.ts's titleFor doc comment.
    if (messages.length === 1) {
      await updateConversationTitle(accountId, conversation.id, titleFor(conversation.topicLabel, lastMessage.content));
    }
  }

  let upstream: Response;
  try {
    upstream = await requestFalcoStream(falcoProvider, systemPrompt, messages, agent?.temperature);
  } catch (error) {
    console.error("[improve-chat] Falco upstream request failed", {
      provider: falcoProvider.kind,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de joindre l'IA pour l'instant. Réessaie dans un instant." },
      { status: 502 }
    );
  }

  if (upstream.status === 429) {
    return NextResponse.json(
      { error: providerErrorMessage(falcoProvider.kind, upstream.status) },
      { status: 429 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    console.error("[improve-chat] Falco upstream rejected request", {
      provider: falcoProvider.kind,
      status: upstream.status,
    });
    return NextResponse.json(
      { error: providerErrorMessage(falcoProvider.kind, upstream.status) },
      { status: upstream.status === 401 || upstream.status === 403 ? 503 : 502 }
    );
  }

  const normalizedBody =
    falcoProvider.kind === "anthropic"
      ? transformAnthropicStream(upstream.body, (usage) => {
          console.info("[improve-chat] Falco Anthropic usage", {
            userId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
          });
        })
      : upstream.body;

  // Tee the stream when the conversation persists: forward chunks to the
  // client unchanged while accumulating the assembled reply to persist once
  // the stream ends. The metric path passes the body straight through,
  // untouched.
  const body = conversation
      ? normalizedBody.pipeThrough(
        createSseAccumulatorStream(async (fullText) => {
          const extracted = extractFalcoInsightEvent(fullText);
          if (extracted.visibleText.trim().length > 0)
            await appendConversationMessage(accountId, conversation.id, "assistant", extracted.visibleText);
          return extracted.event;
        }, { conversationId: conversation.id })
      )
    : normalizedBody;

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
