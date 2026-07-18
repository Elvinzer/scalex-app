"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { STAGE_KNOWLEDGE, type FunnelStageKey } from "@/lib/agent/knowledge";

import { generateFunnelStageInsight } from "./insight-actions";

export type ExistingStageInsight = { insightText: string } | null;

// Centered modal rather than an anchored popover (like date-range-picker's):
// the clicked stat sits in a responsive grid whose position shifts with
// viewport width, so anchoring a popover to it isn't reliable — a
// backdrop + centered card is simpler and works at any grid position.
export function StageInsightPanel({
  stage,
  label,
  existingInsight,
  onClose,
}: {
  stage: FunnelStageKey;
  label: string;
  existingInsight: ExistingStageInsight;
  onClose: () => void;
}) {
  const knowledge = STAGE_KNOWLEDGE[stage];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"result" | "questions">(existingInsight ? "result" : "questions");
  const [insightText, setInsightText] = useState<string | null>(existingInsight?.insightText ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allAnswered = knowledge.questions.every((question) => Boolean(answers[question.id]));

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await generateFunnelStageInsight(stage, answers);
      if (result.error) {
        setError(result.error);
        return;
      }
      setInsightText(result.insightText);
      setMode("result");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="sticker-card max-h-[85vh] w-full max-w-lg overflow-y-auto p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm font-bold">{label}</p>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
            <X className="size-4" />
          </Button>
        </div>

        {mode === "result" && insightText && (
          <div className="mt-4">
            <p className="text-sm">{insightText}</p>
            <button
              type="button"
              onClick={() => setMode("questions")}
              className="mt-4 text-sm font-semibold text-signal"
            >
              Refaire le diagnostic
            </button>
          </div>
        )}

        {mode === "questions" && (
          <div className="mt-4 flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              Réponds à ces questions pour un insight personnalisé sur ce taux.
            </p>

            {knowledge.questions.map((question) => (
              <fieldset key={question.id}>
                <legend className="text-sm font-bold">{question.text}</legend>
                <div className="mt-2 flex flex-col gap-2">
                  {question.options.map((option) => (
                    <label key={option.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={question.id}
                        value={option.id}
                        checked={answers[question.id] === option.id}
                        onChange={() =>
                          setAnswers((previous) => ({ ...previous, [question.id]: option.id }))
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}

            {error && <p className="text-sm text-state-critical">{error}</p>}

            <Button type="button" disabled={!allAnswered || isPending} onClick={handleSubmit}>
              {isPending ? "Génération…" : "Générer mon insight"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
