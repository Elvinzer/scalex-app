import { falcoInsightProtocol, type FalcoInsightEvent } from "./falco-insight-proposal";

const conversationId = "00000000-0000-0000-0000-000000000001";

function encodedResponse(visibleText: string, event: FalcoInsightEvent): string {
  return `${visibleText}\n${falcoInsightProtocol.start}${JSON.stringify(event)}${falcoInsightProtocol.end}`;
}

export const falcoInsightFixtures = {
  actionable: {
    conversationId,
    response: encodedResponse("Le point à travailler est le timing.", {
      kind: "proposal",
      title: "Proposer l'appel plus tôt",
      problem: "La proposition arrive après un échange déjà retombé.",
      actionText: "Tester la proposition d'un appel de 20 minutes après qualification.",
      successCriterion: "Comparer le taux de réservation après 10 conversations qualifiées.",
    }),
  },
  vague: {
    conversationId,
    response: encodedResponse("Il manque encore un élément pour agir.", {
      kind: "vague",
      missing: "Le moment exact où l'appel doit être proposé.",
      quickReplies: ["Après 2 échanges", "Quand le budget est confirmé"],
    }),
  },
  malformed: {
    conversationId,
    response: `Réponse interrompue\n${falcoInsightProtocol.start}{"kind":"proposal","title":${falcoInsightProtocol.end}`,
  },
  nonCalculable: {
    conversationId,
    response: encodedResponse("Ce résultat devra être observé qualitativement.", {
      kind: "proposal",
      title: "Tester une formulation d'appel",
      problem: "La formulation actuelle ne donne pas de raison claire de continuer.",
      actionText: "Tester une formulation qui relie l'appel au problème exprimé.",
      successCriterion: "Noter si le prospect reformule spontanément la valeur de l'appel.",
    }),
  },
  alreadyLinked: {
    conversationId,
    existingInsightId: "00000000-0000-0000-0000-000000000099",
    response: encodedResponse("Cette conversation contient déjà une action.", {
      kind: "proposal",
      title: "Action déjà conservée",
      problem: "Une action existe déjà pour cette conversation.",
      actionText: "Relire et poursuivre l'action existante.",
      successCriterion: "Ne pas créer de deuxième insight pour la même conversation.",
    }),
  },
  longText: {
    conversationId,
    event: {
      kind: "proposal",
      title: "T".repeat(120),
      problem: "P".repeat(800),
      actionText: "A".repeat(2000),
      successCriterion: "C".repeat(1000),
    } satisfies FalcoInsightEvent,
  },
} as const;
