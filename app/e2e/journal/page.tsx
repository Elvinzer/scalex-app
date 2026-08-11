import { notFound } from "next/navigation";

import { JournalView } from "@/app/(app)/journal/journal-view";
import { makeContentAction, makeLeadAction, makeLeverAction, makeMetricAction } from "@/lib/journal/action-generator";
import type { JournalActionLoopData } from "@/lib/journal/action-loop";

const today = "2026-08-08";

export function buildFixtureData(): JournalActionLoopData {
  const todayAction = makeMetricAction({
    key: "responseRate",
    label: "Taux de réponse",
    category: "Setting",
    explanation: "Le goulot est ici : tes premiers messages ouvrent trop peu de conversations.",
    monthlyGainEur: 3200,
    extraClients: 1.4,
    priorityScore: 86,
    status: "pending",
  });
  const bookingAction = makeMetricAction({
    key: "bookingRate",
    label: "Prise de rendez-vous",
    category: "Setting",
    explanation: "Tes appels proposés sont encore trop rarement réservés.",
    monthlyGainEur: 1800,
    extraClients: 0.8,
    priorityScore: 74,
    status: "pending",
    dueDate: "2026-08-01",
    createdAt: "2026-07-28T08:00:00.000Z",
    overdueDays: 7,
  });
  const leverAction = makeLeverAction({
    leverKey: "email_marketing",
    label: "Email marketing",
    category: "Acquisition",
    impactAmountEur: 1400,
    impactExplanation: "Un premier scénario de bienvenue remet ton audience en mouvement.",
    starterStep: "Écris le premier email de bienvenue",
    effort: "faible",
    priorityScore: 69,
    status: "pending",
  });
  const contentAction = makeContentAction({
    recommendationId: "77777777-7777-4777-8777-777777777777",
    title: "Pourquoi tes prospects ne répondent plus",
    rationale: "Un angle pédagogique issu de tes vidéos les plus retenues.",
    estImpact: 2400,
    effort: "moyen",
    priorityScore: 53,
    status: "pending",
  });
  const leadAction = makeLeadAction({
    leadId: "88888888-8888-4888-8888-888888888888",
    leadName: "Camille Martin",
    note: "Reprendre la discussion sur l'offre principale",
    reminderDate: "2026-08-08",
    priorityScore: 96,
    overdueDays: 0,
  });
  const secondLeverAction = makeLeverAction({
    leverKey: "webinar",
    label: "Webinaire",
    category: "Acquisition",
    impactAmountEur: 900,
    impactExplanation: "Un format récurrent pour réchauffer les prospects.",
    starterStep: "Choisis le sujet de ton premier webinaire",
    effort: "moyen",
    priorityScore: 42,
    status: "pending",
  });
  const closingAction = makeMetricAction({
    key: "closingRate",
    label: "Taux de closing",
    category: "Vente",
    explanation: "Ton offre peut encore mieux répondre aux objections entendues en appel.",
    monthlyGainEur: 700,
    extraClients: 0.3,
    priorityScore: 38,
    status: "pending",
  });

  const weeks = [
    "2026-05-25",
    "2026-06-01",
    "2026-06-08",
    "2026-06-15",
    "2026-06-22",
    "2026-06-29",
    "2026-07-06",
    "2026-07-13",
    "2026-07-20",
    "2026-07-27",
    "2026-08-03",
    "2026-08-10",
  ];
  const points = weeks.map((weekStart, index) => ({
    weekStart,
    label: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${weekStart}T12:00:00`)),
    value: 18 + index * 1.8,
  }));
  const closingPoints = points.map((point, index) => ({ ...point, value: 22 + index * 0.8 }));
  const resultChat = { topicType: "metric" as const, topicKey: "responseRate", topicLabel: "Taux de réponse", sourcePage: "journal_result" };

  return {
    todayAction,
    nextActions: [bookingAction, leadAction, leverAction, contentAction, secondLeverAction],
    allNextActions: [bookingAction, leadAction, leverAction, contentAction, secondLeverAction, closingAction],
    moreActionsCount: 1,
    reminders: [
      { id: leadAction.sourceId, leadName: "Camille Martin", note: "Reprendre la discussion sur l'offre principale", reminderDate: today, overdueDays: 0 },
      { id: "99999999-9999-4999-8999-999999999999", leadName: "Noah Williams", note: "Envoyer l'étude de cas", reminderDate: "2026-08-01", overdueDays: 7 },
    ],
    results: [
      { id: "result-positive", title: "Réécris ton premier message de setting", sourceInsight: "Diagnostic · taux de réponse", metricKey: "responseRate", metricLabel: "Taux de réponse", completedAt: "2026-07-01T08:00:00.000Z", state: "positive", deltaValue: 0.06, beforeValue: 0.18, afterValue: 0.24, sampleSize: 42, measurementReason: null, chatContext: resultChat },
      { id: "result-neutral", title: "Simplifie ton invitation à réserver un appel", sourceInsight: "Diagnostic · prise de rendez-vous", metricKey: "bookingRate", metricLabel: "Prise de rendez-vous", completedAt: "2026-06-20T08:00:00.000Z", state: "neutral", deltaValue: -0.01, beforeValue: 0.31, afterValue: 0.3, sampleSize: 36, measurementReason: null, chatContext: { topicType: "metric", topicKey: "bookingRate", topicLabel: "Prise de rendez-vous", sourcePage: "journal_result" } },
      { id: "result-waiting", title: "Envoie un rappel personnalisé avant chaque appel", sourceInsight: "Diagnostic · présence à l'appel", metricKey: "showUpRate", metricLabel: "Présence à l'appel", completedAt: "2026-07-28T08:00:00.000Z", state: "waiting", deltaValue: null, beforeValue: null, afterValue: null, sampleSize: null, measurementReason: "En attente de tes prochains chiffres.", chatContext: { topicType: "metric", topicKey: "showUpRate", topicLabel: "Présence à l'appel", sourcePage: "journal_result" } },
    ],
    timeline: {
      visible: true,
      selectedMetricKey: "responseRate",
      metrics: [{ key: "responseRate", label: "Taux de réponse" }, { key: "bookingRate", label: "Prise de rendez-vous" }],
      points,
      seriesByMetric: { responseRate: points, bookingRate: closingPoints },
      markers: [{ date: "2026-07-01", label: "Réécris ton premier message de setting", metricKey: "responseRate" }, { date: "2026-06-20", label: "Simplifie ton invitation à réserver un appel", metricKey: "bookingRate" }],
    },
    momentum: { actionsDoneThisWeek: 3, scaleScoreDelta30d: 7, activeWeekStreak: 4 },
    emptyState: null,
    dailyActions: [
      { category: "content", labelKey: "content", action: contentAction },
      { category: "sales", labelKey: "sales", action: leadAction },
      { category: "team", labelKey: "organization", action: null },
    ],
    bottleneck: {
      key: "responseRate",
      label: "Taux de réponse",
      category: "Setting",
      currentRatePercent: 18,
      benchmarkRatePercent: 35,
      monthlyGain: 3200,
      extraClients: 1.4,
      href: "/diagnostic?open=responseRate",
      chatContext: { topicType: "metric", topicKey: "responseRate", topicLabel: "Taux de réponse", sourcePage: "roadmap_bottleneck" },
    },
    roadmapItems: [
      { id: todayAction.id, stage: "in_progress", type: "bottleneck", sourceId: todayAction.sourceId, title: todayAction.title, description: todayAction.sourceInsight, progress: 50, impactAmountEur: 3200, href: todayAction.href },
      { id: "roadmap:content", stage: "upcoming", type: "content", sourceId: contentAction.sourceId, title: contentAction.title.replace(/^Tourne la vidéo « /, "").replace(/ »$/, ""), description: "", progress: 0, impactAmountEur: null, href: "/acquisition/contenu", contentKind: "content", staleDays: 21 },
      { id: leverAction.id, stage: "upcoming", type: "lever", sourceId: leverAction.sourceId, title: leverAction.title, description: leverAction.sourceInsight, progress: 0, impactAmountEur: 1400, href: leverAction.href },
    ],
    roadmapVisible: true,
    checkInDoneThisWeek: true,
  };
}

export default function JournalE2EFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const data = buildFixtureData();
  return (
    <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
      <div className="mx-auto max-w-6xl">
        <p className="mb-5 text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement · Journal</p>
        <JournalView
          fixtureMode
          data={data}
          todos={[
            { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", label: "Préparer le brief de la prochaine vidéo", dueDate: "2026-08-09", done: false, projectId: null, isBusinessImprovement: false },
            { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", label: "Réserver le créneau de tournage", dueDate: null, done: true, projectId: null, isBusinessImprovement: false },
          ]}
          projects={[]}
        />
      </div>
    </main>
  );
}
