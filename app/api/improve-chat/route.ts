import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { AGENT_KEY_CONSOLIDATION } from "@/lib/agent/agent-consolidation";
import { getAgentByKey } from "@/lib/agent/agents-registry";
import { appendConversationMessage, getConversation, titleFor, updateConversationTitle } from "@/lib/agent/chat-history";
import { resolveLeverAgentData } from "@/lib/agent/lever-agent-data";
import { createSseAccumulatorStream } from "@/lib/agent/sse-accumulator";
import { track } from "@/lib/analytics";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { getAiProvider } from "@/lib/ai-provider";
import { chatContextSchema, type ChatContext } from "@/lib/chat-context";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { buildImprovePrompt, type LeverMode } from "@/lib/improve-prompt-builder";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

const MAX_MESSAGES = 20;

const METRIC_TOPIC_KEYS = ["responseRate", "proposalRate", "bookingRate", "showUpRate", "closingRate", "followupRecovery"] as const;

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
  const [[userRow], businessProfile, allSettingEntries, allClosingEntries, allMonthlyRows, agent] = await Promise.all([
    db.select().from(users).where(eq(users.id, accountId)).limit(1),
    getBusinessProfile(accountId),
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
    getAgentByKey("falco"),
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

  // No silent fallback to "general" when a specific topic was requested —
  // this is the actual fix for the generic-response bug (a missing/
  // unresolvable topic used to just render the generic prompt). An
  // explicit rejection surfaces the real problem (stale page, bad deep
  // link, resolved/removed lever) instead of masking it as a normal reply.
  let point = null as ReturnType<typeof computeDiagnosticPoints>[number] | null;
  let followup = null as ReturnType<typeof computeFollowupCompliance>[number] | null;
  let leverAgentData: Awaited<ReturnType<typeof resolveLeverAgentData>> = null;
  let leverMode: LeverMode | null = null;

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
  });

  let provider;
  try {
    provider = getAiProvider();
  } catch {
    return NextResponse.json(
      { error: "L'IA n'est pas configurée côté serveur. Préviens l'administrateur." },
      { status: 503 }
    );
  }

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
    upstream = await fetch(provider.baseURL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        stream: true,
        temperature: agent?.temperature,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      // Without this, a Groq connection that never opens (network issue,
      // DNS, provider outage) leaves this await pending forever — the
      // client's own stall timeout only covers a stream that already
      // started, not one that never starts.
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Impossible de joindre l'IA pour l'instant. Réessaie dans un instant." },
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
    return NextResponse.json({ error: "L'IA n'a pas pu répondre. Réessaie dans un instant." }, { status: 502 });
  }

  // Tee the stream when the conversation persists: forward chunks to the
  // client unchanged while accumulating the assembled reply to persist once
  // the stream ends. The metric path passes the body straight through,
  // untouched.
  const body = conversation
    ? upstream.body.pipeThrough(
        createSseAccumulatorStream(async (fullText) => {
          if (fullText.trim().length > 0) {
            await appendConversationMessage(accountId, conversation.id, "assistant", fullText);
          }
        })
      )
    : upstream.body;

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
