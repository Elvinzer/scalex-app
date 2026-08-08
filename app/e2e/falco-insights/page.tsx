import { notFound } from "next/navigation";

import { FalcoJournalActions } from "@/components/insight-execution/falco-journal-actions";
import { InsightActionCard } from "@/components/insight-execution/insight-action-card";
import { falcoInsightFixtures } from "@/lib/agent/falco-insight-proposal.fixtures";
import type { ConversationWithPreview } from "@/lib/agent/chat-history";
import type { InsightHistoryItem, InitiativeStatus } from "@/lib/insight-execution/types";

import { FalcoInsightHistoryFixture } from "./fixture-client";

const conversationId = falcoInsightFixtures.actionable.conversationId;
const secondaryConversationId = "00000000-0000-0000-0000-000000000002";

const proposalEvent = {
  kind: "proposal" as const,
  title: "Proposer l'appel plus tôt",
  problem: "La proposition arrive après un échange déjà retombé.",
  actionText: "Tester la proposition d'un appel de 20 minutes après qualification.",
  successCriterion: "Comparer le taux de réservation après 10 conversations qualifiées.",
};

const vagueEvent = {
  kind: "vague" as const,
  missing: "Le moment exact où l'appel doit être proposé.",
  quickReplies: ["Après 2 échanges", "Voici mon message : [à compléter]", "Quand le budget est confirmé"],
};

function initiative(status: InitiativeStatus, overrides: Partial<InsightHistoryItem["initiative"]> = {}) {
  return {
    id: `00000000-0000-0000-0000-${status === "completed" ? "000000000004" : "000000000003"}`,
    title: "Proposer l'appel plus tôt",
    status,
    dueDate: status === "in_progress" ? "2026-08-15" : null,
    todoId: "00000000-0000-0000-0000-000000000005",
    projectId: null,
    assignedMember: null,
    isWeeklyFocus: status === "in_progress",
    baseline: null,
    latestMeasurement: null,
    snoozedUntil: null,
    ...overrides,
  };
}

function insight(
  decision: InsightHistoryItem["decision"],
  item: Partial<InsightHistoryItem> = {},
): InsightHistoryItem {
  return {
    id: `00000000-0000-0000-0000-${decision === "completed" ? "000000000006" : "000000000007"}`,
    sourceType: "copilote",
    sourceId: conversationId,
    title: "Proposer l'appel plus tôt",
    insightText: "Tester la proposition d'un appel de 20 minutes après qualification.",
    sourceLabel: "Falco · Taux de proposition d'appel",
    decision,
    generatedAt: "2026-08-08T08:00:00.000Z",
    resumeAt: decision === "later" ? "2026-08-15" : null,
    periodStart: null,
    periodEnd: null,
    snapshot: {
      kind: "copilote",
      version: 1,
      problem: "La proposition arrive après un échange déjà retombé.",
      actionText: "Tester la proposition d'un appel de 20 minutes après qualification.",
      successCriterion: "Comparer le taux de réservation après 10 conversations qualifiées.",
    },
    impactProjection: null,
    initiative: null,
    legacy: false,
    ...item,
  };
}

const todoInsight = insight("todo");
const laterInsight = insight("later", { title: "Relancer le test la semaine prochaine" });
const dismissedInsight = insight("dismissed", { title: "Ancienne formulation à écarter" });
const launchedInsight = insight("launched", { initiative: initiative("in_progress") });
const completedInsight = insight("completed", { initiative: initiative("completed") });
const duplicateInsight = insight("todo", { title: "Action déjà associée" });
const longText = "Texte long de critère à lire dans son intégralité. ".repeat(24);
const longInsight = insight("todo", {
  title: "Vérifier la lisibilité des contenus longs dans le Journal",
  insightText: longText,
  snapshot: {
    kind: "copilote",
    version: 1,
    problem: "Les critères longs doivent rester lisibles sans être tronqués définitivement.",
    actionText: longText,
    successCriterion: longText,
  },
});

const history: ConversationWithPreview[] = [
  {
    id: conversationId,
    title: "Taux de proposition d'appel",
    topicType: "lever",
    topicKey: "proposalRate",
    topicLabel: "Taux de proposition d'appel",
    resolved: false,
    createdAt: "2026-08-08T08:00:00.000Z",
    updatedAt: "2026-08-08T08:00:00.000Z",
    preview: "On regarde le timing de la proposition.",
    messageCount: 6,
    insightId: todoInsight.id,
    insightDecision: "todo",
  },
  {
    id: secondaryConversationId,
    title: "Qualification des prospects",
    topicType: "general",
    topicKey: null,
    topicLabel: null,
    resolved: false,
    createdAt: "2026-08-07T08:00:00.000Z",
    updatedAt: "2026-08-07T08:00:00.000Z",
    preview: "Je veux clarifier mon prochain test.",
    messageCount: 3,
    insightId: null,
    insightDecision: null,
  },
];

export default function FalcoInsightsE2EFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header>
          <p className="text-xs font-bold tracking-wide text-accent-2-text uppercase">Fixture locale uniquement</p>
          <h1 className="mt-1 text-3xl font-bold">Falco · QA des insights</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Parcours manuel des états de capture, d’exécution, du Journal, de l’historique et des textes longs.</p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]" aria-labelledby="proposal-title">
          <div className="flex flex-col gap-5">
            <div>
              <h2 id="proposal-title" className="text-xl font-bold">Conversation · proposition et doublon</h2>
              <p className="mt-1 text-sm text-muted-foreground">La carte proposal permet d’ouvrir l’édition ; l’état duplicate conserve l’action existante.</p>
            </div>
            <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" event={proposalEvent} />
            <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" event={proposalEvent} duplicateInsight insight={duplicateInsight} />
          </div>
          <FalcoInsightHistoryFixture conversations={history} />
        </section>

        <section className="grid gap-5 md:grid-cols-2" aria-labelledby="status-title">
          <h2 id="status-title" className="sr-only">États sauvegardés</h2>
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={todoInsight} />
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={laterInsight} />
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={dismissedInsight} />
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={launchedInsight} />
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={completedInsight} />
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" insight={longInsight} />
        </section>

        <section className="grid gap-5 md:grid-cols-2" aria-labelledby="guided-title">
          <div>
            <h2 id="guided-title" className="text-xl font-bold">Guidage sans action</h2>
            <p className="mt-1 text-sm text-muted-foreground">Aucune écriture n’est attendue tant que l’utilisateur n’a pas une action concrète.</p>
          </div>
          <InsightActionCard conversationId={conversationId} sourceLabel="Falco · Taux de proposition d'appel" event={vagueEvent} />
        </section>

        <section aria-labelledby="journal-title">
          <h2 id="journal-title" className="mb-3 text-xl font-bold">Journal · actions lancée et terminée</h2>
          <FalcoJournalActions items={[launchedInsight, completedInsight]} />
        </section>
      </div>
    </main>
  );
}
