import type { NativeBookingAnswerSnapshot } from "@/db/schema";

import { nativeBookingQuestionTypeSchema, type NativeBookingQuestionInput } from "./validation";

export type NativeBookingQuestionRecord = {
  id: string;
  type: NativeBookingQuestionInput["type"];
  label: string;
  helpText: string | null;
  isRequired: boolean;
  options: string[];
  position: number;
};

export type NativeBookingAnswerValue = string | string[];

export type NativeBookingAnswerValidation = {
  ok: boolean;
  fieldErrors: Record<string, string[]>;
  snapshot: NativeBookingAnswerSnapshot[];
};

function answerIsPresent(answer: NativeBookingAnswerValue | undefined): boolean {
  if (Array.isArray(answer)) return answer.some((value) => value.trim().length > 0);
  return Boolean(answer?.trim());
}

function answerValues(answer: NativeBookingAnswerValue | undefined): string[] {
  return (Array.isArray(answer) ? answer : answer === undefined ? [] : [answer]).map((value) => value.trim()).filter(Boolean);
}

export function validateNativeBookingAnswers(
  questions: NativeBookingQuestionRecord[],
  answers: Record<string, NativeBookingAnswerValue>
): NativeBookingAnswerValidation {
  const fieldErrors: Record<string, string[]> = {};
  const snapshot: NativeBookingAnswerSnapshot[] = [];

  for (const question of [...questions].sort((left, right) => left.position - right.position)) {
    const parsedType = nativeBookingQuestionTypeSchema.safeParse(question.type);
    if (!parsedType.success) continue;
    const rawAnswer = answers[question.id];
    const values = answerValues(rawAnswer);

    if (question.isRequired && !answerIsPresent(rawAnswer)) {
      fieldErrors[question.id] = ["Réponds à cette question pour continuer."];
      continue;
    }

    if (question.type === "radio" || question.type === "select") {
      if (values.length > 1) fieldErrors[question.id] = ["Choisis une seule réponse."];
      if (values.some((value) => !question.options.includes(value))) fieldErrors[question.id] = ["Choisis une option proposée."];
    }
    if (question.type === "checkbox" && values.some((value) => !question.options.includes(value))) {
      fieldErrors[question.id] = ["Choisis uniquement les options proposées."];
    }

    const answer: string | string[] = question.type === "checkbox" ? values : values[0] ?? "";
    snapshot.push({
      questionId: question.id,
      type: question.type,
      label: question.label,
      helpText: question.helpText,
      isRequired: question.isRequired,
      options: question.options,
      answer,
    });
  }

  return { ok: Object.keys(fieldErrors).length === 0, fieldErrors, snapshot };
}
