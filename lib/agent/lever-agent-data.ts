import type { BusinessProfileData } from "@/lib/business/types";
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { SectorKey } from "@/lib/benchmarks";
import { formatEur } from "@/lib/currency";
import { inRange } from "@/lib/dashboard/metrics";
import type { MonthWindow } from "@/lib/diagnostic/completed-months";
import {
  aggregateContentTotals,
  computeContentMetricSummaries,
} from "@/lib/diagnostic/content-metrics";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import type { DiagnosticPoint } from "@/lib/diagnostic/cascade";
import { getContentPosts } from "@/lib/content-posts/queries";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { getEmailCampaigns } from "@/lib/email-campaigns/queries";
import { computeEmailCampaignMetrics } from "@/lib/email-campaigns/metrics";
import { getLeversCatalog } from "@/lib/levers/catalog";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { formatPercent } from "@/lib/setting/funnel";
import type { FunnelTotals } from "@/lib/setting/funnel";
import { getSales } from "@/lib/sales/queries";
import { todayUtc } from "@/lib/date-range";
import { getVideoAttributionTotals } from "@/lib/youtube/attribution";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";

export type LeverAgentData = {
  metricsBlock: string;
  impactAmountEur: number | null;
  impactExplanation: string;
  // "18% → objectif 35%" — null when there's no single rate to show (an
  // absent lever with nothing measured yet, or a lever like Produits that
  // isn't a rate to optimize in the first place). Used by the Copilote hub
  // panel/chat header, same formatting as discovery-opportunity-card.tsx's
  // own gapBadge.
  gapBadge: string | null;
};

export type LeverAgentDataContext = {
  accountId: string;
  businessProfile: BusinessProfileData;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  periodMonths: number;
  months: MonthWindow[];
  points: DiagnosticPoint[];
  sector: SectorKey | null;
};

const NO_GAIN_EXPLANATION = "Pas de calcul de gain chiffré pour ce levier — c'est une question de structure, pas d'un taux à corriger.";

function formatGapBadge(statValue: number, benchmarkValue: number): string {
  return `${Math.round(statValue * 100)}% → objectif ${Math.round(benchmarkValue * 100)}%`;
}

async function resolveOpportunityBlock(
  agentKey: string,
  ctx: LeverAgentDataContext
): Promise<{ impactAmountEur: number | null; impactExplanation: string; label: string; gapBadge: string | null } | null> {
  const { toImplement, toWatch } = await computeLeverOpportunities({
    accountId: ctx.accountId,
    businessProfile: ctx.businessProfile,
    settingTotals: ctx.settingTotals,
    closingTotals: ctx.closingTotals,
    cashContractedTotal: ctx.cashContractedTotal,
    periodMonths: ctx.periodMonths,
    months: ctx.months,
  });
  // toWatch (active but below benchmark) carries a real statValue/benchmarkValue
  // to build a gap badge from; toImplement (absent) has nothing measured yet.
  const watchEntry = toWatch.find((o) => o.leverKey === agentKey);
  const implementEntry = toImplement.find((o) => o.leverKey === agentKey);
  const opportunity = implementEntry ?? watchEntry;
  if (!opportunity) return null;
  return {
    impactAmountEur: opportunity.impactAmountEur,
    impactExplanation: opportunity.impactExplanation,
    label: opportunity.label,
    gapBadge: watchEntry ? formatGapBadge(watchEntry.statValue, watchEntry.benchmarkValue) : null,
  };
}

async function buildEmailMarketingData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [opportunity, campaigns] = await Promise.all([
    resolveOpportunityBlock("email_marketing", ctx),
    getEmailCampaigns(ctx.accountId),
  ]);
  const recent = campaigns.slice(0, 3);
  const recentLines =
    recent.length > 0
      ? recent
          .map((c) => {
            const metrics = computeEmailCampaignMetrics(c);
            return `- ${c.name} (${c.sentAt}) : ${c.sends} envois, ${metrics.openRate === null ? "?" : formatPercent(metrics.openRate)} d'ouverture, ${metrics.ctr === null ? "?" : formatPercent(metrics.ctr)} de clic${c.revenueAttributed !== null ? `, ${formatEur(c.revenueAttributed)} de CA attribué` : ""}${c.bookings !== null ? `, ${c.bookings} RDV bookés` : ""}${c.dealsClosed !== null ? `, ${c.dealsClosed} RDV closés` : ""}.`;
          })
          .join("\n")
      : "Aucun envoi enregistré pour l'instant.";

  const gainLine = opportunity
    ? `${opportunity.impactExplanation} Manque à gagner : ${opportunity.impactAmountEur !== null ? `${formatEur(opportunity.impactAmountEur)}/mois` : "non chiffrable"}.`
    : "Ce levier est actif, pas de manque à gagner identifié pour l'instant.";

  return {
    metricsBlock: `${gainLine}\n\nDerniers envois :\n${recentLines}`,
    impactAmountEur: opportunity?.impactAmountEur ?? null,
    impactExplanation: opportunity?.impactExplanation ?? "Ce levier est actif, pas de manque à gagner identifié pour l'instant.",
    gapBadge: opportunity?.gapBadge ?? null,
  };
}

async function buildAdsData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const opportunity = await resolveOpportunityBlock("ads", ctx);

  const gainLine = opportunity
    ? `${opportunity.impactExplanation} Manque à gagner : ${opportunity.impactAmountEur !== null ? `${formatEur(opportunity.impactAmountEur)}/mois` : "non chiffrable"}.`
    : "Ce levier est actif, pas de manque à gagner identifié pour l'instant.";

  return {
    metricsBlock: `${gainLine}\n\nLes performances détaillées sont disponibles dans le module Meta Ads.`,
    impactAmountEur: opportunity?.impactAmountEur ?? null,
    impactExplanation: opportunity?.impactExplanation ?? "Ce levier est actif, pas de manque à gagner identifié pour l'instant.",
    gapBadge: opportunity?.gapBadge ?? null,
  };
}

async function buildUpsellData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [opportunity, allSales] = await Promise.all([resolveOpportunityBlock("upsell_ascension", ctx), getSales(ctx.accountId)]);
  const periodSales = allSales.filter((s) => !s.isOrphan && ctx.months.some(({ range }) => inRange(s.saleDate, range)));
  const takeRate = periodSales.length > 0 ? periodSales.filter((s) => s.hasUpsell).length / periodSales.length : null;
  const recent = allSales.filter((s) => !s.isOrphan && s.hasUpsell).slice(0, 3);
  const offerName = (offerId: string | null) => ctx.businessProfile.sales.offers.find((o) => o.id === offerId)?.name ?? "offre non précisée";
  const recentLines =
    recent.length > 0
      ? recent.map((s) => `- ${s.clientName} (${s.saleDate}) : ${offerName(s.upsellOfferId)}${s.upsellAmount !== null ? `, ${formatEur(s.upsellAmount)}` : ""}.`).join("\n")
      : "Aucun upsell enregistré pour l'instant.";

  const gainLine = opportunity
    ? `${opportunity.impactExplanation} Manque à gagner : ${opportunity.impactAmountEur !== null ? `${formatEur(opportunity.impactAmountEur)}/mois` : "non chiffrable"}.`
    : "Ce levier est actif, pas de manque à gagner identifié pour l'instant.";

  return {
    metricsBlock: `Take-rate sur la période : ${takeRate === null ? "non mesurable" : formatPercent(takeRate)}.\n${gainLine}\n\nDerniers upsells :\n${recentLines}`,
    impactAmountEur: opportunity?.impactAmountEur ?? null,
    impactExplanation: opportunity?.impactExplanation ?? "Ce levier est actif, pas de manque à gagner identifié pour l'instant.",
    gapBadge: opportunity?.gapBadge ?? null,
  };
}

async function buildContentData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [contentBenchmarks, rawPosts, attributions, youtubeInsights] = await Promise.all([
    getContentDiagnosticBenchmarks(ctx.sector),
    getContentPosts(ctx.accountId),
    getVideoAttributionTotals(ctx.accountId),
    getYoutubeVideoInsightsMap(ctx.accountId),
  ]);
  const allPosts = filterVisibleContentPosts(rawPosts, Array.from(youtubeInsights.values()));
  const totals = aggregateContentTotals(ctx.months, allPosts, attributions);
  const summaries = computeContentMetricSummaries({ totals, benchmarks: contentBenchmarks });
  const summaryLines = summaries
    .map((s) => `- ${s.label} : ${s.currentRatePercent === null ? "non mesurable" : `${s.currentRatePercent}%`} vs benchmark ${s.benchmarkRatePercent}% (${s.status}).`)
    .join("\n");

  const recent = allPosts.slice(0, 3);
  const recentLines =
    recent.length > 0
      ? recent
          .map(
            (p) =>
              `- ${p.title} (${p.platform}, ${p.publishedAt}) : ${p.views} vues, ${p.clicks ?? 0} clics, ${p.leads ?? 0} leads${p.bookings !== null ? `, ${p.bookings} RDV bookés` : ""}${p.dealsClosed !== null ? `, ${p.dealsClosed} RDV closés` : ""}.`
          )
          .join("\n")
      : "Aucun post enregistré pour l'instant.";

  // Worst-performing metric (if any) drives the gap badge, same "headline"
  // convention as buildDiagnosticPointsData below.
  const worst = summaries.filter((s) => s.currentRatePercent !== null).sort((a, b) => (a.currentRatePercent ?? 0) - (b.currentRatePercent ?? 0))[0];

  return {
    metricsBlock: `${summaryLines}\n\nDerniers posts :\n${recentLines}`,
    impactAmountEur: null,
    impactExplanation: "Pas de simulation de gain chiffré pour le contenu — pas de cascade directe jusqu'à la vente pour ce levier.",
    gapBadge: worst ? `${worst.currentRatePercent}% → objectif ${worst.benchmarkRatePercent}%` : null,
  };
}

function buildDiagnosticPointsData(points: DiagnosticPoint[], emptyMessage: string): LeverAgentData {
  if (points.length === 0) {
    return { metricsBlock: emptyMessage, impactAmountEur: null, impactExplanation: emptyMessage, gapBadge: null };
  }
  const lines = points.map(
    (p) => `- ${p.label} : ${p.currentRatePercent}% vs benchmark ${p.benchmarkRatePercent}%. ${p.explanation} Manque à gagner : ${p.monthlyGain !== null ? `${formatEur(p.monthlyGain)}/mois` : "non chiffrable"}.`
  );
  const headline = points.reduce((best, p) => ((p.monthlyGain ?? -1) > (best?.monthlyGain ?? -1) ? p : best), points[0]);
  return {
    metricsBlock: lines.join("\n"),
    impactAmountEur: headline.monthlyGain,
    impactExplanation: headline.explanation,
    gapBadge: `${headline.currentRatePercent}% → objectif ${headline.benchmarkRatePercent}%`,
  };
}

async function buildSettingData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const points = ctx.points.filter((p) => p.category === "Setting");
  return buildDiagnosticPointsData(points, "Tous tes taux de setting sont actuellement au niveau du benchmark.");
}

async function buildClosingData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const points = ctx.points.filter((p) => p.category === "Closing");
  const base = buildDiagnosticPointsData(points, "Tous tes taux de closing sont actuellement au niveau du benchmark.");
  const recentSales = (await getSales(ctx.accountId)).filter((sale) => !sale.isOrphan).slice(0, 3);
  const recentLines =
    recentSales.length > 0
      ? recentSales.map((s) => `- ${s.clientName} (${s.saleDate}) : ${formatEur(s.totalPrice)}, closer ${s.closer ?? "non précisé"}.`).join("\n")
      : "Aucune vente enregistrée pour l'instant.";
  return { ...base, metricsBlock: `${base.metricsBlock}\n\nDernières ventes :\n${recentLines}` };
}

async function buildProduitsData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const offers = ctx.businessProfile.sales.offers;
  const today = todayUtc();
  const monthSales = (await getSales(ctx.accountId)).filter((s) => !s.isOrphan && (ctx.months.some(({ range }) => inRange(s.saleDate, range)) || (s.saleDate.startsWith(`${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`))));

  const lines =
    offers.length > 0
      ? offers.map((offer) => {
          const offerSales = monthSales.filter((s) => s.offerId === offer.id);
          const revenue = offerSales.reduce((sum, s) => sum + s.totalPrice, 0);
          return `- ${offer.name || "sans nom"} (${offer.price !== null ? formatEur(offer.price) : "prix non renseigné"}${offer.isMain ? ", OFFRE PRINCIPALE" : ""}) : ${offerSales.length} vente(s), ${formatEur(revenue)} de CA sur la période.`;
        })
      : ["Aucune offre renseignée pour l'instant."];

  return {
    metricsBlock: lines.join("\n"),
    impactAmountEur: null,
    impactExplanation: NO_GAIN_EXPLANATION,
    gapBadge: null,
  };
}

// "Ventes" (consolidated agent — was closing + produits + upsell_ascension,
// 3 separate agents/pages) — concatenates the 3 unchanged builders under
// their own sub-headings rather than writing new business logic. Only
// upsell_ascension has a real levers_catalog leverKey, so its
// impact/gapBadge is what surfaces (closing/produits have none to offer).
async function buildVentesData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [closing, produits, upsell] = await Promise.all([
    buildClosingData(ctx),
    buildProduitsData(ctx),
    buildUpsellData(ctx),
  ]);

  return {
    metricsBlock: `[Closing]\n${closing.metricsBlock}\n\n[Produits]\n${produits.metricsBlock}\n\n[Upsell]\n${upsell.metricsBlock}`,
    impactAmountEur: upsell.impactAmountEur,
    impactExplanation: upsell.impactExplanation,
    gapBadge: upsell.gapBadge,
  };
}

// "CEO Vision" (consolidated agent — was setting + ads, 2 separate
// agents/pages) — same concatenation approach. Only ads has a real
// levers_catalog leverKey, so its impact/gapBadge is what surfaces.
async function buildCeoVisionData(ctx: LeverAgentDataContext): Promise<LeverAgentData> {
  const [setting, ads] = await Promise.all([buildSettingData(ctx), buildAdsData(ctx)]);

  return {
    metricsBlock: `[Setting]\n${setting.metricsBlock}\n\n[Ads]\n${ads.metricsBlock}`,
    impactAmountEur: ads.impactAmountEur,
    impactExplanation: ads.impactExplanation,
    gapBadge: ads.gapBadge,
  };
}

// Fallback for every catalog lever without a dedicated builder above (~14 of
// the ~20, e.g. "vsl") — previously a hard `null` here meant the Copilote
// chat 400'd "Ce levier est introuvable" for most of the catalog. This
// reuses resolveOpportunityBlock exactly as the dedicated builders do (it's
// already generic over any leverKey via computeLeverOpportunities, which
// spans the WHOLE catalog, not just the 4 consolidated agents) — only real
// data, never invented. Returns null only when leverKey isn't a real
// catalog entry at all, preserving the existing "unknown lever → 400" guard.
async function buildGenericLeverData(leverKey: string, ctx: LeverAgentDataContext): Promise<LeverAgentData | null> {
  const catalog = await getLeversCatalog();
  const entry = catalog.find((lever) => lever.leverKey === leverKey);
  if (!entry) return null;

  const opportunity = await resolveOpportunityBlock(leverKey, ctx);
  const gainLine = opportunity
    ? `${opportunity.impactExplanation} Manque à gagner : ${opportunity.impactAmountEur !== null ? `${formatEur(opportunity.impactAmountEur)}/mois` : "non chiffrable"}.`
    : "Pas encore de données mesurées pour ce levier.";

  return {
    metricsBlock: `Levier : ${entry.label}.\n${gainLine}`,
    impactAmountEur: opportunity?.impactAmountEur ?? null,
    impactExplanation: opportunity?.impactExplanation ?? gainLine,
    gapBadge: opportunity?.gapBadge ?? null,
  };
}

// One builder per SURVIVING agentKey (4, was 7) — each reuses the SAME
// query/compute functions the corresponding page already calls for its own
// UI (no new business logic). The retired keys (setting/ads/closing/
// produits/upsell_ascension) are remapped to "ceo_vision"/"ventes" before
// this is ever called (see app/api/improve-chat/route.ts) — this switch
// never sees them directly. Every other real catalog lever falls through to
// buildGenericLeverData; only a genuinely unknown leverKey returns null
// (the caller treats that as "agent introuvable", same as an unresolved
// agent row).
export async function resolveLeverAgentData(agentKey: string, ctx: LeverAgentDataContext): Promise<LeverAgentData | null> {
  switch (agentKey) {
    case "email_marketing":
      return buildEmailMarketingData(ctx);
    case "content":
      return buildContentData(ctx);
    case "ventes":
      return buildVentesData(ctx);
    case "ceo_vision":
      return buildCeoVisionData(ctx);
    default:
      return buildGenericLeverData(agentKey, ctx);
  }
}
