import { describe, expect, it } from "vitest";

import { validateNativeBookingAnswers, type NativeBookingQuestionRecord } from "./questions";

const questions: NativeBookingQuestionRecord[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    type: "radio",
    label: "Objectif",
    helpText: null,
    isRequired: true,
    options: ["Clarifier", "Accélérer"],
    position: 0,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    type: "checkbox",
    label: "Canaux",
    helpText: null,
    isRequired: false,
    options: ["Email", "Téléphone"],
    position: 1,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    type: "textarea",
    label: "Contexte",
    helpText: null,
    isRequired: false,
    options: [],
    position: 2,
  },
];

describe("validateNativeBookingAnswers", () => {
  it("requires required answers and stores a historical snapshot", () => {
    const result = validateNativeBookingAnswers(questions, {
      [questions[0].id]: "Clarifier",
      [questions[1].id]: ["Email"],
      [questions[2].id]: "Besoin de cadrer le prochain trimestre.",
    });

    expect(result.ok).toBe(true);
    expect(result.fieldErrors).toEqual({});
    expect(result.snapshot).toHaveLength(3);
    expect(result.snapshot[0]).toMatchObject({ questionId: questions[0].id, answer: "Clarifier" });
    expect(result.snapshot[1]).toMatchObject({ questionId: questions[1].id, answer: ["Email"] });
  });

  it("rejects missing required answers and options outside the configured list", () => {
    const result = validateNativeBookingAnswers(questions, {
      [questions[1].id]: ["SMS"],
    });

    expect(result.ok).toBe(false);
    expect(result.fieldErrors[questions[0].id]).toBeDefined();
    expect(result.fieldErrors[questions[1].id]).toEqual(["Choisis uniquement les options proposées."]);
  });
});
