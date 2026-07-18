import type { StageKnowledge } from "./types";

// proposalRate = callsProposed / conversationsStarted — la conversation
// démarre mais n'aboutit pas à une proposition d'appel.
export const proposalRateKnowledge: StageKnowledge = {
  questions: [
    {
      id: "exchanges_before_proposal",
      text: "Combien d'échanges en moyenne avant de proposer l'appel ?",
      options: [
        { id: "one_or_two", label: "1 à 2 échanges" },
        { id: "three_to_five", label: "3 à 5 échanges" },
        { id: "six_plus", label: "6 échanges ou plus" },
      ],
    },
    {
      id: "proposal_style",
      text: "Tu proposes l'appel...",
      options: [
        { id: "systematic", label: "Systématiquement, dès que le prospect est qualifié" },
        { id: "wait_for_signal", label: "Seulement si tu sens un fort signal d'intérêt" },
        { id: "rarely", label: "Rarement, la conversation continue sans proposition claire" },
      ],
    },
  ],
  rules: [
    {
      id: "no-systematic-proposal",
      when: (answers) => answers.proposal_style !== "systematic",
      cause: "L'appel n'est pas proposé de façon systématique une fois le prospect qualifié",
      guidance:
        "Intègre une proposition d'appel systématique dès que les critères de qualification sont réunis, plutôt que d'attendre un signal d'intérêt qui peut ne jamais arriver clairement.",
    },
    {
      id: "conversation-too-long",
      when: (answers) => answers.exchanges_before_proposal === "six_plus",
      cause: "La conversation s'étire trop longtemps avant la proposition d'appel",
      guidance:
        "Raccourcis la phase de nurturing : propose l'appel dès que l'intérêt est confirmé, au lieu de laisser la conversation s'essouffler.",
    },
  ],
};
