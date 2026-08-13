import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { getBusinessProfile } from "@/lib/business/queries";
import { getContentPosts } from "@/lib/content-posts/queries";
import { contentRecommendations, users, winningPatterns } from "@/db/schema";
import { requestFalcoJson, resolveFalcoProvider } from "@/lib/agent/falco-provider";
import { falcoLanguageInstruction } from "@/lib/agent/language-instruction";
import { describeBusinessContext } from "@/lib/improve-prompt-builder";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { materializeSourceInsight } from "@/lib/insight-execution/source-adapters";

import { getVideoAttributionTotals } from "./attribution";
import { conversionPerThousandViews } from "./attribution-rules";
import { isPublicVideo } from "./format";
import { getYoutubeVideoInsightsMap, type YoutubeVideoInsightRow } from "./queries";
import type {
  YoutubePatternExample,
  YoutubePatternGroup,
  YoutubePatternLabel,
  YoutubeRecommendationRecord,
  YoutubeWinningPatternsSnapshot,
} from "./recommendation-types";

export const MIN_ANALYZABLE_YOUTUBE_VIDEOS = 5;
const TOP_VIDEOS_LIMIT = 12;
const MAX_RECOMMENDATIONS = 5;

const NUMBER = new Intl.NumberFormat("fr-FR");

type PerformanceMode = "revenue" | "conversion" | "retention";

type VideoPerformance = {
  video: YoutubeVideoInsightRow;
  revenueEur: number;
  attributedSales: number;
  conversionPerThousandViews: number | null;
  retentionScore: number;
};

type ClassifiedVideo = {
  videoId: string;
  theme: string;
  titleStructure: string;
  angle: string;
};

const openAiResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const anthropicResponseSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
  usage: z
    .object({
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const modelResultSchema = z.object({
  videos: z
    .array(
      z.object({
        video_id: z.string().min(1),
        theme: z.string().trim().min(1).max(120),
        title_structure: z.string().trim().min(1).max(120),
        angle: z.string().trim().min(1).max(120),
      })
    )
    .max(TOP_VIDEOS_LIMIT),
  recommendations: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        angle: z.string().trim().min(1).max(240),
        rationale: z.string().trim().min(1).max(900),
        est_impact: z.number().int().nonnegative().nullable(),
        effort: z.enum(["low", "medium", "high"]),
        source_video_ids: z.array(z.string().min(1)).min(1).max(4),
      })
    )
    .min(3)
    .max(MAX_RECOMMENDATIONS),
});

type ModelResult = z.infer<typeof modelResultSchema>;
type WinningPatternsRow = typeof winningPatterns.$inferSelect;

function snapshotFromRow(row: WinningPatternsRow | null): YoutubeWinningPatternsSnapshot | null {
  if (!row) return null;
  return {
    themes: row.themes,
    formats: row.formats,
    titleStructures: row.titleStructures,
    angles: row.angles,
    topVideoIds: row.topVideoIds,
    analyzedVideoCount: row.analyzedVideoCount,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatViews(value: number): string {
  return `${NUMBER.format(Math.round(value))} vues`;
}

function videoFormat(video: YoutubeVideoInsightRow): string {
  if (video.durationSeconds === null) return "Durée inconnue";
  return video.durationSeconds < 60 ? "Short (< 60 s)" : "Longue durée (≥ 60 s)";
}

function performanceExample(entry: VideoPerformance): YoutubePatternExample {
  return {
    videoId: entry.video.videoId,
    title: entry.video.title,
    views: entry.video.views ?? 0,
    revenueEur: entry.revenueEur,
    conversionPerThousandViews: entry.conversionPerThousandViews,
    retentionPercent: entry.video.averageViewPercentage,
  };
}

function groupByLabel(entries: VideoPerformance[], labelFor: (entry: VideoPerformance) => string): YoutubePatternGroup[] {
  const groups = new Map<string, VideoPerformance[]>();
  for (const entry of entries) {
    const label = labelFor(entry).trim();
    if (!label) continue;
    const group = groups.get(label) ?? [];
    group.push(entry);
    groups.set(label, group);
  }

  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.length,
      averageViews: average(group.map((entry) => entry.video.views ?? 0)) ?? 0,
      averageRetentionPercent: average(
        group.map((entry) => entry.video.averageViewPercentage).filter((value): value is number => value !== null)
      ),
      examples: group
        .sort((a, b) => (b.video.views ?? 0) - (a.video.views ?? 0))
        .slice(0, 3)
        .map(performanceExample),
    }))
    .sort((a, b) => b.averageViews - a.averageViews);
}

function choosePerformanceMode(entries: VideoPerformance[]): PerformanceMode {
  if (entries.some((entry) => entry.revenueEur > 0)) return "revenue";
  if (entries.some((entry) => entry.conversionPerThousandViews !== null)) return "conversion";
  return "retention";
}

function sortPerformance(entries: VideoPerformance[], mode: PerformanceMode): VideoPerformance[] {
  return [...entries].sort((a, b) => {
    if (mode === "revenue") {
      return (
        b.revenueEur - a.revenueEur ||
        (b.conversionPerThousandViews ?? -1) - (a.conversionPerThousandViews ?? -1) ||
        b.retentionScore - a.retentionScore ||
        (b.video.views ?? 0) - (a.video.views ?? 0)
      );
    }
    if (mode === "conversion") {
      return (
        (b.conversionPerThousandViews ?? -1) - (a.conversionPerThousandViews ?? -1) ||
        b.revenueEur - a.revenueEur ||
        b.retentionScore - a.retentionScore ||
        (b.video.views ?? 0) - (a.video.views ?? 0)
      );
    }
    return b.retentionScore - a.retentionScore || (b.video.views ?? 0) - (a.video.views ?? 0);
  });
}

function buildPerformance(
  videos: YoutubeVideoInsightRow[],
  attributions: Map<string, { declaredRevenueEur: number; estimatedRevenueEur: number; declaredSales: number; estimatedSales: number }>,
  posts: Awaited<ReturnType<typeof getContentPosts>>
): VideoPerformance[] {
  const commercialByVideo = new Map(
    posts
      .filter((post) => post.source === "youtube" && post.externalId)
      .map((post) => [post.externalId!, { bookings: post.bookings ?? 0, dealsClosed: post.dealsClosed ?? 0 }])
  );

  return videos
    .filter((video) => isPublicVideo(video) && video.title.trim().length > 0 && (video.views ?? 0) > 0)
    .map((video) => {
      const attribution = attributions.get(video.videoId);
      const directlyAttributedSales = (attribution?.declaredSales ?? 0) + (attribution?.estimatedSales ?? 0);
      const manualConversions = commercialByVideo.get(video.videoId)?.bookings ?? commercialByVideo.get(video.videoId)?.dealsClosed ?? 0;
      const attributedSales = directlyAttributedSales > 0 ? directlyAttributedSales : manualConversions;
      const revenueEur = (attribution?.declaredRevenueEur ?? 0) + (attribution?.estimatedRevenueEur ?? 0);
      const conversion = conversionPerThousandViews(video.views, attributedSales);
      const ctr = video.impressionsClickThroughRate ?? 0;
      const retention = video.averageViewPercentage ?? 0;

      return {
        video,
        revenueEur,
        attributedSales,
        conversionPerThousandViews: conversion,
        retentionScore: retention + ctr,
      };
    });
}

function extractHighInterestLowConversion(videos: YoutubeVideoInsightRow[], performances: VideoPerformance[]) {
  const performanceById = new Map(performances.map((entry) => [entry.video.videoId, entry]));
  const terms = new Map<string, { views: number; videoIds: string[]; conversions: number }>();

  for (const video of videos) {
    const performance = performanceById.get(video.videoId);
    if (!performance) continue;
    for (const term of video.searchTerms ?? []) {
      const cleanTerm = term.term.trim();
      if (!cleanTerm || term.views <= 0) continue;
      const current = terms.get(cleanTerm) ?? { views: 0, videoIds: [], conversions: 0 };
      current.views += term.views;
      current.videoIds.push(video.videoId);
      current.conversions += performance.attributedSales;
      terms.set(cleanTerm, current);
    }
  }

  return [...terms.entries()]
    .map(([term, value]) => ({
      term,
      views: value.views,
      conversions: value.conversions,
      conversionPerThousandViews: conversionPerThousandViews(value.views, value.conversions),
      videoIds: dedupe(value.videoIds).slice(0, 4),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
}

function buildPatternLabels(classified: ClassifiedVideo[], key: "titleStructure" | "angle"): YoutubePatternLabel[] {
  const groups = new Map<string, string[]>();
  for (const video of classified) {
    const label = video[key].trim();
    if (!label) continue;
    const examples = groups.get(label) ?? [];
    examples.push(video.videoId);
    groups.set(label, examples);
  }

  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
    .map(([label, videoIds]) => ({ label, examples: dedupe(videoIds) }));
}

function buildThemeGroups(classified: ClassifiedVideo[], performances: VideoPerformance[]): YoutubePatternGroup[] {
  const byId = new Map(performances.map((entry) => [entry.video.videoId, entry]));
  const groups = new Map<string, VideoPerformance[]>();

  for (const video of classified) {
    const performance = byId.get(video.videoId);
    if (!performance) continue;
    const group = groups.get(video.theme) ?? [];
    group.push(performance);
    groups.set(video.theme, group);
  }

  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      count: group.length,
      averageViews: average(group.map((entry) => entry.video.views ?? 0)) ?? 0,
      averageRetentionPercent: average(
        group.map((entry) => entry.video.averageViewPercentage).filter((value): value is number => value !== null)
      ),
      examples: group.sort((a, b) => (b.video.views ?? 0) - (a.video.views ?? 0)).slice(0, 3).map(performanceExample),
    }))
    .sort((a, b) => b.averageViews - a.averageViews);
}

function buildPatterns(
  performances: VideoPerformance[],
  topPerformances: VideoPerformance[],
  classified: ClassifiedVideo[]
): YoutubeWinningPatternsSnapshot {
  return {
    themes: buildThemeGroups(classified, performances),
    formats: groupByLabel(topPerformances, (entry) => videoFormat(entry.video)),
    titleStructures: buildPatternLabels(classified, "titleStructure"),
    angles: buildPatternLabels(classified, "angle"),
    topVideoIds: topPerformances.map((entry) => entry.video.videoId),
    analyzedVideoCount: performances.length,
  };
}

function summarizeVideos(entries: VideoPerformance[]): string {
  return entries
    .map((entry) => {
      const video = entry.video;
      const retention = video.averageViewPercentage === null ? "non mesurée" : `${Math.round(video.averageViewPercentage)}%`;
      const revenue = entry.revenueEur > 0 ? `, ${NUMBER.format(entry.revenueEur)} € attribués` : "";
      const conversion = entry.conversionPerThousandViews === null ? "non calculable" : `${entry.conversionPerThousandViews.toFixed(2)}/1 000 vues`;
      return `- video_id=${video.videoId} | titre=${JSON.stringify(video.title)} | vues=${video.views ?? 0} | rétention=${retention} | conversion=${conversion}${revenue} | format=${videoFormat(video)}`;
    })
    .join("\n");
}

function parseJsonText(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("JSON object not found");
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

async function callFalcoJson(providerUserId: string, prompt: string): Promise<ModelResult> {
  const [user] = await db
    .select({ id: users.id, anthropicApiKeyEncrypted: users.anthropicApiKeyEncrypted, locale: users.locale })
    .from(users)
    .where(eq(users.id, providerUserId))
    .limit(1);
  const provider = await resolveFalcoProvider({
    id: providerUserId,
    anthropicApiKeyEncrypted: user?.anthropicApiKeyEncrypted ?? null,
  });
  const locale = isLocale(user?.locale) ? user.locale : DEFAULT_LOCALE;
  const response = await requestFalcoJson(
    provider,
    "Tu es l'analyste contenu de Minaly. Tu travailles uniquement sur les données de la chaîne YouTube fournies. " +
      "Tu ne cites jamais une autre chaîne et tu n'inventes jamais de chiffre. Réponds uniquement avec le JSON demandé." +
      `\n\n${falcoLanguageInstruction(locale)}`,
    prompt,
    0.25
  );

  if (!response.ok) throw new Error(`${provider.kind} recommendation request failed with status ${response.status}`);

  const rawPayload: unknown = await response.json();
  let content: string;
  let inputTokens = 0;
  let outputTokens = 0;

  if (provider.kind === "anthropic") {
    const payload = anthropicResponseSchema.safeParse(rawPayload);
    if (!payload.success) throw new Error("Anthropic recommendation response malformed");
    content = payload.data.content
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text ?? "")
      .join("");
    inputTokens = payload.data.usage?.input_tokens ?? 0;
    outputTokens = payload.data.usage?.output_tokens ?? 0;
  } else {
    const payload = openAiResponseSchema.safeParse(rawPayload);
    if (!payload.success) throw new Error("Groq recommendation response malformed");
    content = payload.data.choices[0].message.content;
    inputTokens = payload.data.usage?.prompt_tokens ?? 0;
    outputTokens = payload.data.usage?.completion_tokens ?? 0;
  }

  console.info(`[youtube-recommendations] ${provider.kind} usage`, { userId: providerUserId, inputTokens, outputTokens });

  const parsedJson = (() => {
    try {
      return parseJsonText(content);
    } catch {
      throw new Error(`${provider.kind} recommendation JSON could not be parsed`);
    }
  })();
  const parsed = modelResultSchema.safeParse(parsedJson);
  if (!parsed.success) throw new Error(`${provider.kind} recommendation JSON failed validation`);
  return parsed.data;
}

function buildPrompt(
  businessContext: string,
  mode: PerformanceMode,
  topPerformances: VideoPerformance[],
  highInterestLowConversion: ReturnType<typeof extractHighInterestLowConversion>,
  previousPatterns: YoutubeWinningPatternsSnapshot | null
): string {
  return [
    "Objectif : extraire les patterns gagnants de cette chaîne puis proposer 3 à 5 prochaines vidéos qui prolongent uniquement ce qui marche déjà chez elle.",
    `Classement utilisé : ${mode === "revenue" ? "€ attribués, puis conversion, puis rétention" : mode === "conversion" ? "conversion attribuée par 1 000 vues, puis rétention" : "rétention et CTR disponibles, puis vues"}.`,
    "",
    "BUSINESS PROFILE (contexte pour relier le contenu à l'offre, sans inventer de besoin) :",
    businessContext,
    "",
    "VIDÉOS LES PLUS PERFORMANTES (les seules sources autorisées pour les preuves) :",
    summarizeVideos(topPerformances),
    "",
    "PROFIL GAGNANT PRÉCÉDENT (mémoire de la chaîne, à confirmer ou corriger avec les vidéos ci-dessus) :",
    previousPatterns
      ? JSON.stringify({
          themes: previousPatterns.themes,
          formats: previousPatterns.formats,
          title_structures: previousPatterns.titleStructures,
          angles: previousPatterns.angles,
          top_video_ids: previousPatterns.topVideoIds,
          analyzed_video_count: previousPatterns.analyzedVideoCount,
        })
      : "Aucun profil précédent : première analyse.",
    "",
    "REQUÊTES À FORT INTÉRÊT MAIS FAIBLE CONVERSION (signaux de pont entre recherche et offre ; vide si aucune) :",
    highInterestLowConversion.length > 0 ? JSON.stringify(highInterestLowConversion) : "[]",
    "",
    "Retourne exactement ce JSON :",
    JSON.stringify({
      videos: [
        {
          video_id: "un video_id fourni",
          theme: "un thème court observé dans le titre",
          title_structure: "question, chiffre, cas client, promesse, erreur, etc.",
          angle: "tuto, cas client, erreur à éviter, coulisses, etc.",
        },
      ],
      recommendations: [
        {
          title: "titre proposé dans le style des titres gagnants",
          angle: "angle et format dérivés des patterns observés",
          rationale: "pourquoi cela devrait marcher, avec au moins une preuve réelle du bloc vidéos",
          est_impact: 1200,
          effort: "low",
          source_video_ids: ["au moins un video_id fourni"],
        },
      ],
    }),
    "Contraintes : videos doit classifier chaque video_id utile. recommendations doit contenir 3 à 5 objets. " +
      "Chaque recommandation cite une ou plusieurs sources via source_video_ids et son rationale mentionne une donnée réelle. " +
      "est_impact est une estimation prudente de vues, jamais une garantie, basée sur la moyenne des vidéos sources. " +
      "Ne propose aucun sujet générique si les sources ne permettent pas de l'ancrer.",
  ].join("\n");
}

function evidenceForRecommendation(sourceEntries: VideoPerformance[]): string {
  const source = sourceEntries[0];
  if (!source) return "";
  const retention = source.video.averageViewPercentage === null ? null : `${Math.round(source.video.averageViewPercentage)}% de rétention`;
  const revenue = source.revenueEur > 0 ? `${NUMBER.format(source.revenueEur)} € attribués` : null;
  const signals = [formatViews(source.video.views ?? 0), retention, revenue].filter((value): value is string => value !== null);
  return `Donnée observée : « ${source.video.title} » — ${signals.join(", ")}.`;
}

function effortLabel(effort: "low" | "medium" | "high"): string {
  return effort === "low" ? "Faible" : effort === "medium" ? "Moyen" : "Élevé";
}

function recommendationRecords(
  result: ModelResult,
  topPerformances: VideoPerformance[],
  patterns: YoutubeWinningPatternsSnapshot
): Omit<YoutubeRecommendationRecord, "id" | "createdAt" | "updatedAt" | "status" | "linkedVideoId">[] {
  const byId = new Map(topPerformances.map((entry) => [entry.video.videoId, entry]));
  const seenTitles = new Set<string>();

  return result.recommendations.reduce<
    Omit<YoutubeRecommendationRecord, "id" | "createdAt" | "updatedAt" | "status" | "linkedVideoId">[]
  >((recommendations, item) => {
    const titleKey = item.title.toLocaleLowerCase("fr-FR");
    if (seenTitles.has(titleKey)) return recommendations;
    const sourceVideoIds = dedupe(item.source_video_ids).filter((id) => byId.has(id)).slice(0, 4);
    const sourceEntries = sourceVideoIds.map((id) => byId.get(id)).filter((entry): entry is VideoPerformance => entry !== undefined);
    if (sourceEntries.length === 0) return recommendations;

    const averageSourceViews = average(sourceEntries.map((entry) => entry.video.views ?? 0)) ?? 0;
    const modelImpact = item.est_impact;
    const conservativeCeiling = Math.max(1, Math.round(averageSourceViews * 1.25));
    const conservativeFloor = Math.max(1, Math.round(averageSourceViews * 0.5));
    const estImpact = Math.max(conservativeFloor, Math.min(modelImpact ?? Math.round(averageSourceViews), conservativeCeiling));
    const sourceTheme = patterns.themes.find((theme) => theme.examples.some((example) => sourceVideoIds.includes(example.videoId)));
    const basis = `Moyenne observée sur ${sourceEntries.length} vidéo${sourceEntries.length > 1 ? "s" : ""} source${sourceEntries.length > 1 ? "s" : ""}${sourceTheme ? ` du thème « ${sourceTheme.label} »` : ""} : ${formatViews(averageSourceViews)}. Estimation prudente, pas une garantie.`;

    seenTitles.add(titleKey);
    recommendations.push({
      title: item.title,
      angle: item.angle,
      rationale: `${item.rationale} ${evidenceForRecommendation(sourceEntries)}`.trim(),
      estImpact,
      impactBasis: basis,
      effort: effortLabel(item.effort),
      sourceVideoIds,
    });
    return recommendations;
  }, []).slice(0, MAX_RECOMMENDATIONS);
}

async function savePatterns(userId: string, snapshot: YoutubeWinningPatternsSnapshot): Promise<void> {
  await db
    .insert(winningPatterns)
    .values({
      userId,
      themes: snapshot.themes,
      formats: snapshot.formats,
      titleStructures: snapshot.titleStructures,
      angles: snapshot.angles,
      topVideoIds: snapshot.topVideoIds,
      analyzedVideoCount: snapshot.analyzedVideoCount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: winningPatterns.userId,
      set: {
        themes: snapshot.themes,
        formats: snapshot.formats,
        titleStructures: snapshot.titleStructures,
        angles: snapshot.angles,
        topVideoIds: snapshot.topVideoIds,
        analyzedVideoCount: snapshot.analyzedVideoCount,
        updatedAt: new Date(),
      },
    });
}

export type RebuildRecommendationsResult = {
  state: "generated" | "insufficient_data" | "generation_failed";
  count: number;
  analyzedVideoCount: number;
};

// Called after every YouTube sync and by the manual regeneration action. All
// aggregates/rankings are computed here in code; Falco receives the resulting
// figures and only labels patterns / writes the ideas.
export async function rebuildYoutubeContentRecommendations(
  userId: string,
  providerUserId = userId
): Promise<RebuildRecommendationsResult> {
  const [videosMap, posts, attributions, businessProfile, previousPatternsRow] = await Promise.all([
    getYoutubeVideoInsightsMap(userId),
    getContentPosts(userId),
    getVideoAttributionTotals(userId),
    getBusinessProfile(userId),
    getWinningPatterns(userId),
  ]);
  const videos = [...videosMap.values()].filter(isPublicVideo);
  const performances = buildPerformance(videos, attributions, posts);
  const mode = choosePerformanceMode(performances);
  const ranked = sortPerformance(performances, mode);
  const topPerformances = ranked.slice(0, TOP_VIDEOS_LIMIT);

  if (performances.length < MIN_ANALYZABLE_YOUTUBE_VIDEOS) {
    await savePatterns(userId, {
      themes: [],
      formats: groupByLabel(topPerformances, (entry) => videoFormat(entry.video)),
      titleStructures: [],
      angles: [],
      topVideoIds: topPerformances.map((entry) => entry.video.videoId),
      analyzedVideoCount: performances.length,
    });
    await db.delete(contentRecommendations).where(and(eq(contentRecommendations.userId, userId), eq(contentRecommendations.status, "new")));
    return { state: "insufficient_data", count: 0, analyzedVideoCount: performances.length };
  }

  const highInterestLowConversion = extractHighInterestLowConversion(videos, performances);
  const baseSnapshot: YoutubeWinningPatternsSnapshot = {
    themes: [],
    formats: groupByLabel(topPerformances, (entry) => videoFormat(entry.video)),
    titleStructures: [],
    angles: [],
    topVideoIds: topPerformances.map((entry) => entry.video.videoId),
    analyzedVideoCount: performances.length,
  };
  let modelResult: ModelResult;
  try {
    modelResult = await callFalcoJson(
      providerUserId,
      buildPrompt(
        describeBusinessContext(businessProfile),
        mode,
        topPerformances,
        highInterestLowConversion,
        snapshotFromRow(previousPatternsRow)
      )
    );
  } catch (error) {
    console.error("[youtube-recommendations] generation failed", error);
    const previousPatterns = snapshotFromRow(previousPatternsRow);
    await savePatterns(
      userId,
      previousPatterns
        ? {
            themes: previousPatterns.themes,
            formats: baseSnapshot.formats,
            titleStructures: previousPatterns.titleStructures,
            angles: previousPatterns.angles,
            topVideoIds: baseSnapshot.topVideoIds,
            analyzedVideoCount: baseSnapshot.analyzedVideoCount,
          }
        : baseSnapshot
    );
    return { state: "generation_failed", count: 0, analyzedVideoCount: performances.length };
  }

  const validVideoIds = new Set(topPerformances.map((entry) => entry.video.videoId));
  const classified: ClassifiedVideo[] = dedupe(
    modelResult.videos
      .filter((item) => validVideoIds.has(item.video_id))
      .map((item) => item.video_id)
  ).flatMap((videoId) => {
    const item = modelResult.videos.find((candidate) => candidate.video_id === videoId);
    return item ? [{ videoId, theme: item.theme, titleStructure: item.title_structure, angle: item.angle }] : [];
  });
  const snapshot = buildPatterns(performances, topPerformances, classified);
  await savePatterns(userId, snapshot);

  const recommendations = recommendationRecords(modelResult, topPerformances, snapshot);
  if (recommendations.length === 0) return { state: "generation_failed", count: 0, analyzedVideoCount: performances.length };

  await db.delete(contentRecommendations).where(and(eq(contentRecommendations.userId, userId), eq(contentRecommendations.status, "new")));
  const insertedRecommendations = await db.insert(contentRecommendations).values(
    recommendations.map((recommendation) => ({
      userId,
      title: recommendation.title,
      angle: recommendation.angle,
      rationale: recommendation.rationale,
      estImpact: recommendation.estImpact,
      impactBasis: recommendation.impactBasis,
      effort: recommendation.effort,
      status: "new" as const,
      sourceVideoIds: recommendation.sourceVideoIds,
      linkedVideoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  ).returning({ id: contentRecommendations.id });

  // New recommendations are already actionable when generated. Persist their
  // normalized history now; the later Journal launch remains idempotent.
  await Promise.all(
    insertedRecommendations.map(async (recommendation) => {
      try {
        await materializeSourceInsight(userId, {
          sourceType: "content_recommendation",
          sourceId: recommendation.id,
        });
      } catch {
        // The content recommendation itself remains available; an explicit
        // launch retries history materialization.
      }
    }),
  );

  return { state: "generated", count: recommendations.length, analyzedVideoCount: performances.length };
}

export async function getWinningPatterns(userId: string) {
  const [row] = await db.select().from(winningPatterns).where(eq(winningPatterns.userId, userId)).limit(1);
  return row ?? null;
}

export async function getContentRecommendation(userId: string, recommendationId: string): Promise<YoutubeRecommendationRecord | null> {
  const [row] = await db
    .select()
    .from(contentRecommendations)
    .where(and(eq(contentRecommendations.userId, userId), eq(contentRecommendations.id, recommendationId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    angle: row.angle,
    rationale: row.rationale,
    estImpact: row.estImpact,
    impactBasis: row.impactBasis,
    effort: row.effort,
    status: row.status,
    sourceVideoIds: row.sourceVideoIds,
    linkedVideoId: row.linkedVideoId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getContentRecommendations(userId: string): Promise<YoutubeRecommendationRecord[]> {
  const rows = await db
    .select()
    .from(contentRecommendations)
    .where(eq(contentRecommendations.userId, userId))
    .orderBy(desc(contentRecommendations.createdAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    angle: row.angle,
    rationale: row.rationale,
    estImpact: row.estImpact,
    impactBasis: row.impactBasis,
    effort: row.effort,
    status: row.status,
    sourceVideoIds: row.sourceVideoIds,
    linkedVideoId: row.linkedVideoId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
