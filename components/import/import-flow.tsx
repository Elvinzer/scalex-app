"use client";

import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";
import type { AnalyzeResponse, CommitImportPayload } from "@/lib/import/schema";

import { commitImport } from "@/app/(app)/datas/import-actions";

import { ImportClarify } from "./import-clarify";
import { ImportDropzone } from "./import-dropzone";
import { ImportPreview } from "./import-preview";

type Step =
  | { kind: "dropzone" }
  | { kind: "analyzing" }
  | { kind: "clarify"; analysis: AnalyzeResponse }
  | { kind: "preview"; analysis: AnalyzeResponse }
  | { kind: "duplicate_confirm"; payload: CommitImportPayload; previousMonth: string }
  | { kind: "committing"; payload: CommitImportPayload }
  | { kind: "done"; fieldsWritten: number }
  | { kind: "error"; message: string };

// Shared by both entry points (Mes chiffres drawer, onboarding inline) —
// only what wraps this component differs (Drawer vs. inline layout), the
// upload→analyze→clarify→preview state machine is identical. Onboarding
// passes onExtracted instead of relying on the default commit path: a
// brand new account has no monthly_metrics row yet to write/conflict with,
// so it just needs the resolved values handed back to fill its own form.
export function ImportFlow({
  source,
  onCommitted,
  onExtracted,
}: {
  source: "onboarding" | "datas";
  onCommitted?: () => void;
  onExtracted?: (values: Record<string, number>, year: number, month: number) => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "dropzone" });

  async function handleFilesSelected(files: File[]) {
    setStep({ kind: "analyzing" });
    trackClient("import_started", { source, file_type: files[0]?.name.split(".").pop() ?? "unknown" });

    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);

      const response = await fetch("/api/import/analyze", { method: "POST", body: formData });
      const body = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok || body.error) {
        setStep({ kind: "error", message: body.error ?? "Impossible d'analyser ce fichier." });
        return;
      }

      const questionCount = body.files.reduce((sum, f) => sum + f.mapping.questions.length, 0);
      if (questionCount > 0) trackClient("import_questions_asked", { count: questionCount });

      const hasQuestions = body.files.some((f) => f.mapping.questions.length > 0 || f.mapping.periodDetected === null);
      setStep(hasQuestions ? { kind: "clarify", analysis: body } : { kind: "preview", analysis: body });
    } catch {
      setStep({ kind: "error", message: "Erreur réseau pendant l'analyse du fichier." });
    }
  }

  async function handleCommit(payload: CommitImportPayload) {
    setStep({ kind: "committing", payload });
    const result = await commitImport(payload);

    if (result.status === "duplicate_warning") {
      const label = result.previousImport.targetMonth ? `${result.previousImport.targetMonth}/${result.previousImport.targetYear}` : "un mois précédent";
      setStep({ kind: "duplicate_confirm", payload, previousMonth: label });
      return;
    }
    if (result.status === "error") {
      setStep({ kind: "error", message: result.error });
      return;
    }

    trackClient("import_committed", { fields_count: result.fieldsWritten, months_count: result.monthsCount, had_conflicts: result.blockedFields.length > 0 });
    setStep({ kind: "done", fieldsWritten: result.fieldsWritten });
    onCommitted?.();
  }

  function handleAbandon(atStep: string) {
    trackClient("import_abandoned", { step: atStep });
    setStep({ kind: "dropzone" });
  }

  switch (step.kind) {
    case "dropzone":
      return <ImportDropzone onFilesSelected={handleFilesSelected} />;

    case "analyzing":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="thinking" size="md" animate="enter" />
          <p className="text-sm text-muted-foreground">Falco trie ton fichier...</p>
        </div>
      );

    case "clarify":
      return (
        <ImportClarify
          files={step.analysis.files}
          onResolved={(files) => setStep({ kind: "preview", analysis: { ...step.analysis, files } })}
        />
      );

    case "preview":
      return (
        <ImportPreview
          files={step.analysis.files}
          existingMonths={step.analysis.existingMonths}
          tokens={step.analysis.tokens}
          keySource={step.analysis.keySource}
          onCommit={onExtracted ? undefined : handleCommit}
          onExtracted={onExtracted}
          onCancel={() => handleAbandon("preview")}
          isCommitting={false}
        />
      );

    case "committing":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="thinking" size="md" animate="enter" />
          <p className="text-sm text-muted-foreground">Import en cours...</p>
        </div>
      );

    case "duplicate_confirm":
      return (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Falco pose="neutral" size="md" animate="enter" />
          <p className="text-sm">
            Tu as déjà importé ce fichier pour <span className="font-bold">{step.previousMonth}</span>. Importer quand même ?
          </p>
          <div className="flex gap-2">
            <Button onClick={() => handleCommit({ ...step.payload, confirmDuplicate: true })}>Importer quand même</Button>
            <Button variant="secondary" onClick={() => handleAbandon("duplicate_confirm")}>
              Annuler
            </Button>
          </div>
        </div>
      );

    case "done":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="happy" size="md" animate="enter" />
          <p className="text-sm font-bold">
            C&apos;est rangé. {step.fieldsWritten} valeur{step.fieldsWritten > 1 ? "s" : ""} importée{step.fieldsWritten > 1 ? "s" : ""}, ton
            diagnostic est à jour.
          </p>
        </div>
      );

    case "error":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="sleeping" size="md" animate="enter" />
          <p className="text-sm text-state-critical">{step.message}</p>
          <Button variant="secondary" onClick={() => setStep({ kind: "dropzone" })}>
            Réessayer
          </Button>
        </div>
      );
  }
}
