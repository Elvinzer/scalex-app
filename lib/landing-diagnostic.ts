import type { MetricKey } from "@/lib/diagnostic/metric-keys";

export type GrowthAnswer = string | number | null | string[];
export type GrowthAnswers = Record<string, GrowthAnswer>;

export type GrowthQuestionType = "number" | "choice" | "multi";
export type GrowthGroupKey =
  | "audience"
  | "funnel"
  | "economics"
  | "operations"
  | "acquisition"
  | "content"
  | "ads"
  | "tracking"
  | "levers";

export type GrowthQuestion = {
  id: string;
  type: GrowthQuestionType;
  group: GrowthGroupKey;
  questionKey: string;
  helpKey: string;
  suffixKey?: string;
  example?: string;
  options?: ReadonlyArray<{ labelKey: string; value: string | number | null }>;
  when?: (answers: GrowthAnswers) => boolean;
};

export type GrowthAxisId = "capture" | "rdv" | "presence" | "closing" | "valeur" | "systeme";

export const GROWTH_AXES = [
  { id: "capture", weight: 0.15, unit: "rate" },
  { id: "rdv", weight: 0.2, unit: "rate" },
  { id: "presence", weight: 0.15, unit: "rate" },
  { id: "closing", weight: 0.2, unit: "rate" },
  { id: "valeur", weight: 0.15, unit: "currency" },
  { id: "systeme", weight: 0.15, unit: "currencyPerHour" },
] as const satisfies ReadonlyArray<{ id: GrowthAxisId; weight: number; unit: string }>;

export type GrowthLeverId =
  | "webinaire"
  | "upsell"
  | "vsl"
  | "newsletter"
  | "seo"
  | "retargeting"
  | "parrainage"
  | "podcast";

export const GROWTH_LEVERS = [
  { id: "webinaire", axe: "rdv", uplift: 0.18, labelKey: "webinaire", delayKey: "webinaire", noteKey: "webinaire" },
  { id: "upsell", axe: "valeur", uplift: 0.16, labelKey: "upsell", delayKey: "upsell", noteKey: "upsell" },
  { id: "vsl", axe: "rdv", uplift: 0.12, labelKey: "vsl", delayKey: "vsl", noteKey: "vsl" },
  { id: "newsletter", axe: "capture", uplift: 0.11, labelKey: "newsletter", delayKey: "newsletter", noteKey: "newsletter" },
  { id: "seo", axe: "capture", uplift: 0.1, labelKey: "seo", delayKey: "seo", noteKey: "seo" },
  { id: "retargeting", axe: "rdv", uplift: 0.09, labelKey: "retargeting", delayKey: "retargeting", noteKey: "retargeting" },
  { id: "parrainage", axe: "capture", uplift: 0.08, labelKey: "parrainage", delayKey: "parrainage", noteKey: "parrainage" },
  { id: "podcast", axe: "closing", uplift: 0.06, labelKey: "podcast", delayKey: "podcast", noteKey: "podcast" },
] as const satisfies ReadonlyArray<{
  id: GrowthLeverId;
  axe: GrowthAxisId;
  uplift: number;
  labelKey: string;
  delayKey: string;
  noteKey: string;
}>;

const DEFAULT_BENCHMARKS: Record<MetricKey, number> = {
  responseRate: 0.3,
  proposalRate: 0.25,
  bookingRate: 0.6,
  showUpRate: 0.7,
  closingRate: 0.3,
};

const SCORE_TARGET = 70;
const GAP_TO_CLOSE = 0.6;
const BOTTLENECK_CAP = 2.5;
const TOTAL_CAP = 3.2;
const LEVER_DECAY = 0.65;
const MAX_LEVER_UPLIFT = 0.45;
const NON_BOTTLENECK_WEIGHT = 0.6;
const MAX_CAPACITY_GAIN = 0.8;
const WEEKS_PER_MONTH = 4.33;

export const GROWTH_QUESTIONS: ReadonlyArray<GrowthQuestion> = [
  {
    id: "audience",
    type: "number",
    group: "audience",
    questionKey: "questions.audience",
    helpKey: "help.audience",
    suffixKey: "suffix.people",
    example: "3 000",
  },
  {
    id: "leads",
    type: "number",
    group: "audience",
    questionKey: "questions.leads",
    helpKey: "help.leads",
    suffixKey: "suffix.leads",
    example: "90",
  },
  {
    id: "rdvPris",
    type: "number",
    group: "funnel",
    questionKey: "questions.rdvPris",
    helpKey: "help.rdvPris",
    suffixKey: "suffix.appointments",
    example: "20",
  },
  {
    id: "rdvHonores",
    type: "number",
    group: "funnel",
    questionKey: "questions.rdvHonores",
    helpKey: "help.rdvHonores",
    suffixKey: "suffix.calls",
    example: "13",
  },
  {
    id: "ventes",
    type: "number",
    group: "funnel",
    questionKey: "questions.ventes",
    helpKey: "help.ventes",
    suffixKey: "suffix.sales",
    example: "3",
  },
  {
    id: "prix",
    type: "number",
    group: "economics",
    questionKey: "questions.prix",
    helpKey: "help.prix",
    suffixKey: "suffix.euros",
    example: "1 500",
  },
  {
    id: "retention",
    type: "choice",
    group: "economics",
    questionKey: "questions.retention",
    helpKey: "help.retention",
    options: [
      { labelKey: "options.retentionLow", value: 0.4 },
      { labelKey: "options.retentionMedium", value: 0.6 },
      { labelKey: "options.retentionHigh", value: 0.8 },
      { labelKey: "options.retentionVeryHigh", value: 0.95 },
    ],
  },
  {
    id: "heures",
    type: "number",
    group: "economics",
    questionKey: "questions.heures",
    helpKey: "help.heures",
    suffixKey: "suffix.hours",
    example: "45",
  },
  {
    id: "delegation",
    type: "choice",
    group: "operations",
    questionKey: "questions.delegation",
    helpKey: "help.delegation",
    options: [
      { labelKey: "options.delegationNone", value: 0 },
      { labelKey: "options.delegationLow", value: 0.33 },
      { labelKey: "options.delegationMedium", value: 0.66 },
      { labelKey: "options.delegationHigh", value: 1 },
    ],
  },
  {
    id: "systemeAcq",
    type: "choice",
    group: "acquisition",
    questionKey: "questions.systemeAcq",
    helpKey: "help.systemeAcq",
    options: [
      { labelKey: "options.systemCall", value: "call" },
      { labelKey: "options.systemLeadMagnet", value: "magnet" },
      { labelKey: "options.systemVsl", value: "vsl" },
      { labelKey: "options.systemWebinar", value: "webinaire" },
      { labelKey: "options.systemFreemium", value: "freemium" },
      { labelKey: "options.systemOrganic", value: "organique" },
      { labelKey: "options.systemReferral", value: "bao" },
    ],
  },
  {
    id: "convSysteme",
    type: "choice",
    group: "acquisition",
    questionKey: "questions.convSysteme",
    helpKey: "help.convSysteme",
    options: [
      { labelKey: "options.rateLow", value: 0.008 },
      { labelKey: "options.rateMedium", value: 0.02 },
      { labelKey: "options.rateHigh", value: 0.055 },
      { labelKey: "options.rateVeryHigh", value: 0.1 },
      { labelKey: "options.notMeasured", value: null },
    ],
  },
  {
    id: "emails",
    type: "choice",
    group: "acquisition",
    questionKey: "questions.emails",
    helpKey: "help.emails",
    options: [
      { labelKey: "options.emailNone", value: "non" },
      { labelKey: "options.emailOccasional", value: "occas" },
      { labelKey: "options.emailAutomated", value: "auto" },
      { labelKey: "options.emailComplete", value: "complet" },
    ],
  },
  {
    id: "convEmail",
    type: "choice",
    group: "acquisition",
    questionKey: "questions.convEmail",
    helpKey: "help.convEmail",
    when: (answers) => answers.emails !== undefined && answers.emails !== "non",
    options: [
      { labelKey: "options.rateLow", value: 0.008 },
      { labelKey: "options.rateMedium", value: 0.02 },
      { labelKey: "options.rateHighEmail", value: 0.04 },
      { labelKey: "options.notMeasured", value: null },
    ],
  },
  {
    id: "contenu",
    type: "choice",
    group: "content",
    questionKey: "questions.contenu",
    helpKey: "help.contenu",
    options: [
      { labelKey: "options.contentNone", value: 0 },
      { labelKey: "options.contentIrregular", value: 0.33 },
      { labelKey: "options.contentWeekly", value: 0.66 },
      { labelKey: "options.contentDaily", value: 1 },
    ],
  },
  {
    id: "plateforme",
    type: "multi",
    group: "content",
    questionKey: "questions.plateforme",
    helpKey: "help.plateforme",
    when: (answers) => numericValue(answers.contenu) > 0,
    options: [
      { labelKey: "options.platformYoutube", value: "yt" },
      { labelKey: "options.platformInstagram", value: "ig" },
      { labelKey: "options.platformLinkedin", value: "li" },
      { labelKey: "options.platformPodcast", value: "pod" },
      { labelKey: "options.platformSeo", value: "blog" },
      { labelKey: "options.platformX", value: "x" },
    ],
  },
  {
    id: "adsActif",
    type: "choice",
    group: "ads",
    questionKey: "questions.adsActif",
    helpKey: "help.adsActif",
    options: [
      { labelKey: "options.adsNo", value: "non" },
      { labelKey: "options.adsTest", value: "test" },
      { labelKey: "options.adsContinuous", value: "continu" },
    ],
  },
  {
    id: "adsBudget",
    type: "number",
    group: "ads",
    questionKey: "questions.adsBudget",
    helpKey: "help.adsBudget",
    suffixKey: "suffix.eurosPerMonth",
    example: "1 200",
    when: (answers) => answers.adsActif !== undefined && answers.adsActif !== "non",
  },
  {
    id: "adsRetour",
    type: "choice",
    group: "ads",
    questionKey: "questions.adsRetour",
    helpKey: "help.adsRetour",
    when: (answers) => answers.adsActif !== undefined && answers.adsActif !== "non",
    options: [
      { labelKey: "options.adsPrecise", value: "precis" },
      { labelKey: "options.adsApprox", value: "approx" },
      { labelKey: "options.notMeasured", value: null },
    ],
  },
  {
    id: "adsCA",
    type: "number",
    group: "ads",
    questionKey: "questions.adsCA",
    helpKey: "help.adsCA",
    suffixKey: "suffix.eurosPerMonth",
    example: "3 600",
    when: (answers) => answers.adsRetour === "precis" || answers.adsRetour === "approx",
  },
  {
    id: "suivi",
    type: "choice",
    group: "tracking",
    questionKey: "questions.suivi",
    helpKey: "help.suivi",
    options: [
      { labelKey: "options.trackingNone", value: 0 },
      { labelKey: "options.trackingPartial", value: 0.33 },
      { labelKey: "options.trackingManual", value: 0.66 },
      { labelKey: "options.trackingLive", value: 1 },
    ],
  },
  {
    id: "leviers",
    type: "multi",
    group: "levers",
    questionKey: "questions.leviers",
    helpKey: "help.leviers",
    options: GROWTH_LEVERS.map((lever) => ({ labelKey: `options.lever.${lever.labelKey}`, value: lever.id })),
  },
];

export function questionsActives(answers: GrowthAnswers): GrowthQuestion[] {
  return GROWTH_QUESTIONS.filter((question) => !question.when || question.when(answers));
}

export type GrowthAxisResult = {
  id: GrowthAxisId;
  score: number;
  rate: number;
  target: number;
  unit: (typeof GROWTH_AXES)[number]["unit"];
};

export type GrowthBottleneck = GrowthAxisResult;

export type GrowthLeverResult = {
  id: GrowthLeverId;
  axe: GrowthAxisId;
  uplift: number;
  effect: number;
  amount: number;
  aimsBottleneck: boolean;
};

export type GrowthAngle = { id: string; titleKey: string; detailKey: string };

export type GrowthResult = {
  benchmarks: Record<MetricKey, number>;
  axisScores: GrowthAxisResult[];
  global: number;
  badgeKey: "repair" | "fragile" | "solid" | "ready";
  bottleneck: GrowthBottleneck;
  currentRevenue: number;
  revenueAfterBottleneck: number;
  bottleneckGain: number;
  totalPotential: number;
  leverGain: number;
  leverUplift: number;
  bottleneckCapped: boolean;
  totalCapped: boolean;
  hoursFreed: number;
  angles: GrowthAngle[];
  roas: number | null;
  adBudget: number;
  adRevenue: number;
  profileKey: "1-1" | "0-1" | "1-0" | "0-0";
  nicheScore: number;
  nicheBandKey: "low" | "fair" | "high" | "premium";
  funnel: {
    audience: number;
    leads: number;
    appointments: number;
    attended: number;
    sales: number;
    projectedLeads: number;
    projectedAppointments: number;
    projectedAttended: number;
    projectedSales: number;
  };
  levers: GrowthLeverResult[];
};

function numericValue(value: GrowthAnswer | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
  return 0;
}

function benchmarkValue(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(value, 1) : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function scoreFor(rate: number, target: number): number {
  return clamp(Math.round(SCORE_TARGET * (rate / target)), 0, 100);
}

function towardTarget(rate: number, target: number): number {
  return rate + (Math.max(rate, target) - rate) * GAP_TO_CLOSE;
}

function badgeFor(score: number): GrowthResult["badgeKey"] {
  if (score < 40) return "repair";
  if (score < 58) return "fragile";
  if (score < 78) return "solid";
  return "ready";
}

function nicheBandFor(score: number): GrowthResult["nicheBandKey"] {
  if (score < 35) return "low";
  if (score < 58) return "fair";
  if (score < 78) return "high";
  return "premium";
}

export function calculateGrowthDiagnostic(
  answers: GrowthAnswers,
  benchmarkSnapshot: Record<MetricKey, number>
): GrowthResult {
  const benchmarks: Record<MetricKey, number> = {
    responseRate: benchmarkValue(benchmarkSnapshot.responseRate, DEFAULT_BENCHMARKS.responseRate),
    proposalRate: benchmarkValue(benchmarkSnapshot.proposalRate, DEFAULT_BENCHMARKS.proposalRate),
    bookingRate: benchmarkValue(benchmarkSnapshot.bookingRate, DEFAULT_BENCHMARKS.bookingRate),
    showUpRate: benchmarkValue(benchmarkSnapshot.showUpRate, DEFAULT_BENCHMARKS.showUpRate),
    closingRate: benchmarkValue(benchmarkSnapshot.closingRate, DEFAULT_BENCHMARKS.closingRate),
  };

  const audience = Math.max(1, numericValue(answers.audience));
  const leads = numericValue(answers.leads);
  const appointments = numericValue(answers.rdvPris);
  const attended = Math.min(numericValue(answers.rdvHonores), appointments || numericValue(answers.rdvHonores));
  const sales = numericValue(answers.ventes);
  const price = numericValue(answers.prix);
  const hours = Math.max(1, numericValue(answers.heures));
  const retention = typeof answers.retention === "number" ? answers.retention : 0.6;
  const delegation = typeof answers.delegation === "number" ? answers.delegation : 0;
  const tracking = typeof answers.suivi === "number" ? answers.suivi : 0;

  const rates: Record<GrowthAxisId, number> = {
    capture: leads / audience,
    rdv: leads > 0 ? appointments / leads : 0,
    presence: appointments > 0 ? attended / appointments : 0,
    closing: attended > 0 ? sales / attended : 0,
    valeur: price * retention,
    systeme: (sales * price) / (hours * WEEKS_PER_MONTH),
  };

  const targets: Record<GrowthAxisId, number> = {
    capture: benchmarks.responseRate,
    // The app separates proposition and booking. The package's single RDV
    // axis represents the combined lead-to-booked-call journey.
    rdv: Math.max(0.01, benchmarks.proposalRate * benchmarks.bookingRate),
    presence: benchmarks.showUpRate,
    closing: benchmarks.closingRate,
    valeur: 1_500,
    systeme: 250,
  };

  const scores: Record<GrowthAxisId, number> = {
    capture: scoreFor(rates.capture, targets.capture),
    rdv: scoreFor(rates.rdv, targets.rdv),
    presence: scoreFor(rates.presence, targets.presence),
    closing: scoreFor(rates.closing, targets.closing),
    valeur: scoreFor(rates.valeur, targets.valeur),
    systeme: clamp(Math.round(scoreFor(rates.systeme, targets.systeme) * 0.6 + delegation * 100 * 0.4), 0, 100),
  };

  const axisScores = GROWTH_AXES.map((axis) => ({
    id: axis.id,
    score: scores[axis.id],
    rate: rates[axis.id],
    target: targets[axis.id],
    unit: axis.unit,
  }));
  const global = Math.round(axisScores.reduce((total, axis) => total + axis.score * GROWTH_AXES.find((item) => item.id === axis.id)!.weight, 0));
  const bottleneck = [...axisScores].sort((a, b) => a.score - b.score)[0];
  const currentRevenue = sales * price;

  const projectedRates = { ...rates };
  let projectedPrice = price;
  let capacity = 1;

  if (bottleneck.id === "valeur") {
    projectedPrice = towardTarget(price, targets.valeur / Math.max(retention, 0.5));
  } else if (bottleneck.id === "systeme") {
    capacity = 1 + Math.min(MAX_CAPACITY_GAIN, (1 - delegation) * GAP_TO_CLOSE);
  } else {
    projectedRates[bottleneck.id] = towardTarget(rates[bottleneck.id], bottleneck.target);
  }

  const projectedLeads = audience * projectedRates.capture;
  const projectedAppointments = projectedLeads * projectedRates.rdv;
  const projectedAttended = projectedAppointments * projectedRates.presence;
  const projectedSales = projectedAttended * projectedRates.closing * capacity;
  const projectedRevenueBeforeCap = projectedSales * projectedPrice;
  const revenueAfterBottleneck = currentRevenue > 0
    ? clamp(projectedRevenueBeforeCap, currentRevenue, currentRevenue * BOTTLENECK_CAP)
    : projectedRevenueBeforeCap;
  const bottleneckCapped = currentRevenue > 0 && projectedRevenueBeforeCap > currentRevenue * BOTTLENECK_CAP;
  const projectionFactor = projectedRevenueBeforeCap > 0 ? revenueAfterBottleneck / projectedRevenueBeforeCap : 1;
  const bottleneckGain = Math.max(0, revenueAfterBottleneck - currentRevenue);
  const hoursFreed = bottleneck.id === "systeme"
    ? Math.round(hours * (1 - delegation) * GAP_TO_CLOSE * 0.5)
    : 0;

  const selectedLeverIds = Array.isArray(answers.leviers) ? answers.leviers : [];
  const selectedLevers = selectedLeverIds
    .map((id) => GROWTH_LEVERS.find((lever) => lever.id === id))
    .filter((lever): lever is (typeof GROWTH_LEVERS)[number] => Boolean(lever))
    .map((lever) => ({
      ...lever,
      effect: lever.uplift * (lever.axe === bottleneck.id ? 1 : NON_BOTTLENECK_WEIGHT),
      aimsBottleneck: lever.axe === bottleneck.id,
    }))
    .sort((a, b) => b.effect - a.effect);
  let leverUplift = 0;
  const levers: GrowthLeverResult[] = selectedLevers.map((lever, index) => {
    const contribution = lever.effect * Math.pow(LEVER_DECAY, index);
    leverUplift += contribution;
    return {
      id: lever.id,
      axe: lever.axe,
      uplift: lever.uplift,
      effect: contribution,
      amount: revenueAfterBottleneck * contribution,
      aimsBottleneck: lever.aimsBottleneck,
    };
  });
  leverUplift = Math.min(leverUplift, MAX_LEVER_UPLIFT);
  const projectedTotalBeforeCap = revenueAfterBottleneck * (1 + leverUplift);
  const totalPotential = currentRevenue > 0
    ? Math.min(projectedTotalBeforeCap, currentRevenue * TOTAL_CAP)
    : projectedTotalBeforeCap;
  const leverGain = Math.max(0, totalPotential - revenueAfterBottleneck);
  const totalCapped = currentRevenue > 0 && projectedTotalBeforeCap > currentRevenue * TOTAL_CAP;

  const angles: GrowthAngle[] = [];
  if (answers.convSysteme === null && "convSysteme" in answers) {
    angles.push({ id: "convSysteme", titleKey: "conversionSystem", detailKey: "conversionSystem" });
  }
  if (answers.emails !== "non" && answers.convEmail === null && "convEmail" in answers) {
    angles.push({ id: "convEmail", titleKey: "emailPerformance", detailKey: "emailPerformance" });
  }
  if (answers.adsActif !== "non" && answers.adsRetour === null && "adsRetour" in answers) {
    angles.push({ id: "adsRetour", titleKey: "adReturn", detailKey: "adReturn" });
  }
  if (answers.adsRetour === "approx") {
    angles.push({ id: "adsApprox", titleKey: "adAttribution", detailKey: "adAttribution" });
  }
  if (tracking <= 0.33) {
    angles.push({ id: "tracking", titleKey: "stepRates", detailKey: "stepRates" });
  }
  if (answers.systemeAcq === "bao" || answers.systemeAcq === "organique") {
    angles.push({ id: "origin", titleKey: "clientOrigin", detailKey: "clientOrigin" });
  }

  const adBudget = numericValue(answers.adsBudget);
  const adRevenue = numericValue(answers.adsCA);
  const roas = adBudget > 0 && adRevenue > 0 ? adRevenue / adBudget : null;
  const nicheScore = clamp(
    Math.round(
      clamp((price / 2_000) * 100, 0, 100) * 0.45 +
        clamp((rates.closing / targets.closing) * 100, 0, 100) * 0.35 +
        retention * 100 * 0.2
    ),
    0,
    100
  );
  const monetizes = (scores.closing + scores.valeur) / 2 >= 58;
  const systematizes = scores.systeme * 0.6 + tracking * 100 * 0.4 >= 58;
  const profileKey = `${systematizes ? 1 : 0}-${monetizes ? 1 : 0}` as GrowthResult["profileKey"];

  return {
    benchmarks,
    axisScores,
    global,
    badgeKey: badgeFor(global),
    bottleneck,
    currentRevenue,
    revenueAfterBottleneck,
    bottleneckGain,
    totalPotential,
    leverGain,
    leverUplift,
    bottleneckCapped,
    totalCapped,
    hoursFreed,
    angles,
    roas,
    adBudget,
    adRevenue,
    profileKey,
    nicheScore,
    nicheBandKey: nicheBandFor(nicheScore),
    funnel: {
      audience,
      leads,
      appointments,
      attended,
      sales,
      projectedLeads: projectedLeads * projectionFactor,
      projectedAppointments: projectedAppointments * projectionFactor,
      projectedAttended: projectedAttended * projectionFactor,
      projectedSales: projectedSales * projectionFactor,
    },
    levers,
  };
}

