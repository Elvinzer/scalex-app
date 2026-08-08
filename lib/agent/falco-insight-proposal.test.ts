import { describe, expect, it } from "vitest";

import {
  extractFalcoInsightEvent,
  falcoInsightEventSchema,
  falcoInsightSseEnvelopeSchema,
  parseFalcoInsightSseEnvelope,
  falcoInsightProtocol,
  prepareFalcoQuickReply,
  removeFalcoInsightProtocol,
} from "./falco-insight-proposal";
import { falcoInsightFixtures } from "./falco-insight-proposal.fixtures";

describe("Falco insight protocol", () => {
  it("extracts a valid proposal and keeps the visible response", () => {
    const text = [
      "Voici ce que je te propose.",
      falcoInsightProtocol.start,
      JSON.stringify({
        kind: "proposal",
        title: "Proposer plus tôt",
        problem: "Le timing est tardif.",
        actionText: "Tester la proposition après qualification.",
        successCriterion: "Faire le point dans 7 jours.",
      }),
      falcoInsightProtocol.end,
    ].join("\n");

    const result = extractFalcoInsightEvent(text);
    expect(result.visibleText).toBe("Voici ce que je te propose.");
    expect(result.event).toEqual({
      kind: "proposal",
      title: "Proposer plus tôt",
      problem: "Le timing est tardif.",
      actionText: "Tester la proposition après qualification.",
      successCriterion: "Faire le point dans 7 jours.",
    });
  });

  it("accepts a vague event with quick replies", () => {
    const text = `${falcoInsightProtocol.start}${JSON.stringify({
      kind: "vague",
      missing: "Le moment de proposition manque.",
      quickReplies: ["Après 2–3 échanges", "Quand il demande"],
    })}${falcoInsightProtocol.end}`;

    expect(extractFalcoInsightEvent(text).event).toEqual({
      kind: "vague",
      missing: "Le moment de proposition manque.",
      quickReplies: ["Après 2–3 échanges", "Quand il demande"],
    });
  });

  it("opens an incomplete quick reply in the composer without sending the placeholder", () => {
    expect(prepareFalcoQuickReply("Voici mon message : [à compléter]")).toEqual({
      mode: "compose",
      text: "Voici mon message : ",
    });
    expect(prepareFalcoQuickReply("Je n'ai pas de template fixe")).toEqual({
      mode: "send",
      text: "Je n'ai pas de template fixe",
    });
  });

  it("ignores malformed or incomplete events without throwing", () => {
    const malformed = `${falcoInsightProtocol.start}{not-json}${falcoInsightProtocol.end}`;
    expect(extractFalcoInsightEvent(`Texte\n${malformed}`)).toEqual({
      visibleText: "Texte",
      event: null,
    });
    expect(extractFalcoInsightEvent(`${falcoInsightProtocol.start}{`)).toEqual({
      visibleText: "",
      event: null,
    });
  });

  it("hides an unfinished protocol tail while streaming", () => {
    expect(removeFalcoInsightProtocol(`Texte visible ${falcoInsightProtocol.start}{`)).toBe("Texte visible");
    expect(removeFalcoInsightProtocol("Texte visible")).toBe("Texte visible");
    expect(extractFalcoInsightEvent("Texte visible")).toEqual({ visibleText: "Texte visible", event: null });
  });

  it("replays the actionable, vague, malformed and non-calculable fixtures", () => {
    expect(extractFalcoInsightEvent(falcoInsightFixtures.actionable.response).event?.kind).toBe("proposal");
    expect(extractFalcoInsightEvent(falcoInsightFixtures.vague.response).event?.kind).toBe("vague");
    expect(extractFalcoInsightEvent(falcoInsightFixtures.malformed.response).event).toBeNull();

    const nonCalculable = extractFalcoInsightEvent(falcoInsightFixtures.nonCalculable.response).event;
    expect(nonCalculable?.kind).toBe("proposal");
    expect(nonCalculable?.kind === "proposal" && nonCalculable.successCriterion).not.toMatch(/\d/);
  });

  it("keeps the already-linked and maximum-length fixtures bounded", () => {
    expect(falcoInsightFixtures.alreadyLinked.existingInsightId).toBeTruthy();
    expect(falcoInsightFixtures.alreadyLinked.conversationId).toBe(falcoInsightFixtures.actionable.conversationId);
    expect(falcoInsightEventSchema.safeParse(falcoInsightFixtures.longText.event).success).toBe(true);
    expect(falcoInsightEventSchema.safeParse({ ...falcoInsightFixtures.longText.event, title: "T".repeat(121) }).success).toBe(false);
  });

  it("rejects an SSE event with a missing or foreign conversation id", () => {
    const event = extractFalcoInsightEvent(falcoInsightFixtures.actionable.response).event;
    const matching = { conversationId: falcoInsightFixtures.actionable.conversationId, falcoInsightEvent: event };
    const foreign = { conversationId: "00000000-0000-0000-0000-000000000099", falcoInsightEvent: event };
    expect(falcoInsightSseEnvelopeSchema.safeParse(matching).success).toBe(true);
    expect(parseFalcoInsightSseEnvelope(matching, falcoInsightFixtures.actionable.conversationId)).toEqual(event);
    expect(parseFalcoInsightSseEnvelope(foreign, falcoInsightFixtures.actionable.conversationId)).toBeNull();
    expect(falcoInsightSseEnvelopeSchema.safeParse({ falcoInsightEvent: event }).success).toBe(false);
  });
});
