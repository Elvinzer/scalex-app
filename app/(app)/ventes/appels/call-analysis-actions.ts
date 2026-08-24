"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { closingVideos, salesCalls } from "@/db/schema";
import { requestFalcoJson, resolveFalcoProvider } from "@/lib/agent/falco-provider";
import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser, requireUserIdOrError } from "@/lib/current-user";
import { getClosingVideo } from "@/lib/closing-videos/queries";
import { requirePermission } from "@/lib/team/context";

const nullableText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(max).nullable(),
);

const recordingSchema = z.object({
  callId: z.string().uuid(),
  url: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().url().max(2000).nullable(),
  ),
  transcript: nullableText(20000),
  notes: nullableText(4000),
});

const analysisSchema = z.object({
  score: z.number().int().min(0).max(10),
  summary: z.string().trim().min(1).max(1200),
  strengths: z.array(z.string().trim().min(1).max(300)).max(6),
  improvements: z.array(z.string().trim().min(1).max(400)).max(8),
  roadmap: z.array(z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(600),
  })).max(5),
});

const responseEnvelopeSchema = z.object({
  content: z.array(z.object({ text: z.string().optional() }).passthrough()).optional(),
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }).optional() }).passthrough()).optional(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
    prompt_tokens: z.number().int().nonnegative().optional(),
    completion_tokens: z.number().int().nonnegative().optional(),
  }).optional(),
}).passthrough();

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function getCall(accountId: string, callId: string) {
  const [call] = await db
    .select()
    .from(salesCalls)
    .where(and(eq(salesCalls.id, callId), eq(salesCalls.userId, accountId)))
    .limit(1);
  return call ?? null;
}

function videoOutcome(call: { outcome: string }): "closed" | "not_closed" | "pending" {
  if (call.outcome === "closed") return "closed";
  if (call.outcome === "not_closed") return "not_closed";
  return "pending";
}

export async function saveCallRecording(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = recordingSchema.safeParse(data);
  if (!parsed.success) return { error: "Le lien ou le contenu de l’appel est invalide." };
  const call = await getCall(access.accountId, parsed.data.callId);
  if (!call) return { error: "Appel introuvable." };

  const [existing] = await db
    .select({ id: closingVideos.id })
    .from(closingVideos)
    .where(and(eq(closingVideos.userId, access.accountId), eq(closingVideos.salesCallId, call.id)))
    .orderBy(desc(closingVideos.createdAt))
    .limit(1);
  const values = {
    clientName: call.inviteeName?.trim() || "Appel sans nom",
    callDate: call.scheduledAt.toISOString().slice(0, 10),
    url: parsed.data.url,
    transcript: parsed.data.transcript,
    notes: parsed.data.notes,
    outcome: videoOutcome(call),
    falcoAnalysis: null,
  } as const;

  if (existing) {
    await db.update(closingVideos).set(values).where(and(eq(closingVideos.id, existing.id), eq(closingVideos.userId, access.accountId)));
  } else {
    await db.insert(closingVideos).values({ userId: access.accountId, salesCallId: call.id, ...values });
  }

  revalidatePath("/ventes/appels");
  return { error: null };
}

function callContext(video: { clientName: string; callDate: string; outcome: string; transcript: string | null; notes: string | null }): string {
  return [
    `Client : ${video.clientName}`,
    `Date : ${video.callDate}`,
    `Issue : ${video.outcome}`,
    video.transcript ? `Transcription :\n${video.transcript}` : video.notes ? `Notes :\n${video.notes}` : "Aucune transcription ni note n’est disponible.",
  ].join("\n\n");
}

function extractJson(raw: unknown): { text: string; inputTokens: number; outputTokens: number } | null {
  const parsed = responseEnvelopeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const text = parsed.data.content?.find((block) => block.text)?.text
    ?? parsed.data.choices?.find((choice) => choice.message?.content)?.message?.content
    ?? null;
  if (!text) return null;
  const usage = parsed.data.usage;
  return {
    text: text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
    inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0,
  };
}

export async function analyzeCallWithFalco(callId: string): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const parsedCallId = z.string().uuid().safeParse(callId);
  if (!parsedCallId.success) return { error: "Appel invalide." };

  const video = await db
    .select()
    .from(closingVideos)
    .where(and(eq(closingVideos.userId, access.accountId), eq(closingVideos.salesCallId, parsedCallId.data)))
    .orderBy(desc(closingVideos.createdAt))
    .limit(1);
  const videoId = video[0]?.id;
  if (!videoId) return { error: "Ajoute d’abord le lien ou la transcription de cet appel." };
  const closingVideo = await getClosingVideo(access.accountId, videoId);
  if (!closingVideo) return { error: "Données de l’appel introuvables." };

  const businessProfile = await getBusinessProfile(access.accountId);
  let provider: Awaited<ReturnType<typeof resolveFalcoProvider>>;
  try {
    const { user } = await getCurrentUser();
    if (!user) return { error: "Compte utilisateur introuvable." };
    provider = await resolveFalcoProvider({ id: user.id, anthropicApiKeyEncrypted: user.anthropicApiKeyEncrypted });
  } catch (error) {
    return { error: errorMessage(error, "Falco n’est pas configuré pour le moment.") };
  }

  const systemPrompt = [
    "Tu es Falco, coach senior en closing high-ticket.",
    "Tu analyses uniquement les éléments fournis et tu n’inventes aucun détail.",
    "Réponds uniquement avec un objet JSON valide, sans markdown, avec exactement les clés score, summary, strengths, improvements et roadmap.",
    "score est un entier de 0 à 10. roadmap contient uniquement les améliorations structurelles importantes qui méritent une place dans la Roadmap. Les petites corrections restent dans improvements.",
  ].join("\n");
  const prompt = `${callContext(closingVideo)}\n\nContexte de l’offre : ${JSON.stringify(businessProfile.sales.offers)}`;

  let response: Response;
  try {
    response = await requestFalcoJson(provider, systemPrompt, prompt, 0.2, 3000);
  } catch (error) {
    return { error: errorMessage(error, "Falco n’a pas pu analyser cet appel.") };
  }
  if (!response.ok) return { error: "Falco n’a pas pu analyser cet appel. Réessaie dans un instant." };

  const payload: unknown = await response.json();
  const extracted = extractJson(payload);
  if (!extracted) return { error: "Falco a renvoyé une réponse inexploitable. Réessaie." };
  let decoded: unknown;
  try {
    decoded = JSON.parse(extracted.text) as unknown;
  } catch {
    return { error: "Falco a renvoyé une analyse inexploitable. Réessaie." };
  }
  const analysis = analysisSchema.safeParse(decoded);
  if (!analysis.success) return { error: "Falco a renvoyé une analyse incomplète. Réessaie." };

  console.info("[falco-call-analysis] completed", {
    provider: provider.kind,
    source: provider.kind === "anthropic" ? provider.source : "shared",
    inputTokens: extracted.inputTokens,
    outputTokens: extracted.outputTokens,
  });
  await db.update(closingVideos).set({
    falcoAnalysis: { ...analysis.data, roadmap: analysis.data.roadmap.map((item, index) => ({ ...item, id: `${videoId}-roadmap-${index + 1}` })), analyzedAt: new Date().toISOString() },
  }).where(and(eq(closingVideos.id, videoId), eq(closingVideos.userId, access.accountId)));

  revalidatePath("/ventes/appels");
  revalidatePath("/roadmap");
  return { error: null };
}
