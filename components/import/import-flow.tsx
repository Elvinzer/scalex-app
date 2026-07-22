"use client";

import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { Button } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics-client";
import { falcoReactionClassName } from "@/lib/falco-events";
import type { AnalyzeResponse, CommitImportPayload } from "@/lib/import/schema";

import { commitImport, type BlockedField } from "@/app/(app)/datas/import-actions";

import { ImportClarify } from "./import-clarify";
import { ImportDropzone } from "./import-dropzone";
import { ImportPreview } from "./import-preview";

type Step =
  | { kind: "dropzone" }
  | { kind: "analyzing" }
  | { kind: "clarify"; analysis: AnalyzeResponse }
  | { kind: "preview"; analysis: AnalyzeResponse }
  | { kind: "duplicate_confirm"; payloads: CommitImportPayload[]; previousMonth: string }
  | { kind: "committing"; payloads: CommitImportPayload[] }
  | { kind: "done"; fieldsWritten: number; blockedFields: BlockedField[] }
  | { kind: "error"; message: string };

function questionCountFor(analysis: AnalyzeResponse): number {
  return analysis.sheets.reduce((sum, sheet) => {
    const headerQuestion = sheet.headerRowConfident ? 0 : 1;
    const periodQuestion = sheet.mapping.targetTable !== "ignore" && sheet.mapping.dateColumnName === null && sheet.mapping.periodDetected === null ? 1 : 0;
    return sum + sheet.mapping.questions.length + headerQuestion + periodQuestion;
  }, 0);
}

function hasPendingQuestions(analysis: AnalyzeResponse): boolean {
  return analysis.sheets.some(
    (sheet) =>
      sheet.mapping.questions.length > 0 ||
      !sheet.headerRowConfident ||
      (sheet.mapping.targetTable !== "ignore" && sheet.mapping.dateColumnName === null && sheet.mapping.periodDetected === null)
  );
}

// Shared by both entry points (Mes chiffres drawer, onboarding inline) —
// only what wraps this component differs (Drawer vs. inline layout), the
// upload→analyze→clarify→preview→commit state machine is identical for
// both: onboarding used to special-case a single extracted month, but a
// brand new account commits through commitImport exactly like any other
// account (nothing there requires a pre-existing monthly_metrics row) —
// onCommitted is enough for onboarding to know it's time to compute the
// diagnosis, however many months the import actually covered.
export function ImportFlow({
  source,
  onCommitted,
}: {
  source: "onboarding" | "datas";
  onCommitted?: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: "dropzone" });
  // Kept around so a "which line is your header row?" answer can
  // re-upload and re-analyze — the client only has 3 preview rows, not the
  // full raw grid needed to re-slice headers/values itself.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [headerOverrides, setHeaderOverrides] = useState<Record<string, number>>({});

  async function analyze(files: File[], overrides: Record<string, number>) {
    setStep({ kind: "analyzing" });
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      if (Object.keys(overrides).length > 0) formData.append("headerOverrides", JSON.stringify(overrides));

      const response = await fetch("/api/import/analyze", { method: "POST", body: formData });
      const body = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok || body.error) {
        setStep({ kind: "error", message: body.error ?? "Impossible d'analyser ce fichier." });
        return;
      }

      const count = questionCountFor(body);
      if (count > 0) trackClient("import_questions_asked", { count });

      setStep(hasPendingQuestions(body) ? { kind: "clarify", analysis: body } : { kind: "preview", analysis: body });
    } catch {
      setStep({ kind: "error", message: "Erreur réseau pendant l'analyse du fichier." });
    }
  }

  async function handleFilesSelected(files: File[]) {
    setPendingFiles(files);
    setHeaderOverrides({});
    trackClient("import_started", { source, file_type: files[0]?.name.split(".").pop() ?? "unknown" });
    await analyze(files, {});
  }

  async function handleHeaderRowChosen(sheetName: string, rowIndex: number) {
    const nextOverrides = { ...headerOverrides, [sheetName]: rowIndex };
    setHeaderOverrides(nextOverrides);
    await analyze(pendingFiles, nextOverrides);
  }

  async function handleCommit(payloads: CommitImportPayload[]) {
    setStep({ kind: "committing", payloads });

    let totalFieldsWritten = 0;
    let totalMonths = 0;
    const blockedFieldsByName = new Map<string, BlockedField>();

    for (const payload of payloads) {
      const result = await commitImport(payload);

      if (result.status === "duplicate_warning") {
        const label = result.previousImport.targetMonth ? `${result.previousImport.targetMonth}/${result.previousImport.targetYear}` : "un mois précédent";
        setStep({ kind: "duplicate_confirm", payloads, previousMonth: label });
        return;
      }
      if (result.status === "error") {
        setStep({ kind: "error", message: result.error });
        return;
      }

      totalFieldsWritten += result.fieldsWritten;
      totalMonths += result.monthsCount;
      for (const blocked of result.blockedFields) blockedFieldsByName.set(blocked.field, blocked);
    }

    trackClient("import_committed", {
      fields_count: totalFieldsWritten,
      months_count: totalMonths,
      had_conflicts: blockedFieldsByName.size > 0,
    });
    setStep({ kind: "done", fieldsWritten: totalFieldsWritten, blockedFields: [...blockedFieldsByName.values()] });
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
          <FalcoPondering isLoading pose="thinking" size="md" label="Falco trie ton fichier..." className="flex-col" />
        </div>
      );

    case "clarify":
      return (
        <ImportClarify
          sheets={step.analysis.sheets}
          onResolved={(sheets) => setStep({ kind: "preview", analysis: { ...step.analysis, sheets } })}
          onHeaderRowChosen={handleHeaderRowChosen}
        />
      );

    case "preview":
      return (
        <ImportPreview
          sheets={step.analysis.sheets}
          existingMonths={step.analysis.existingMonths}
          tokens={step.analysis.tokens}
          keySource={step.analysis.keySource}
          onCommit={handleCommit}
          onCancel={() => handleAbandon("preview")}
          isCommitting={false}
        />
      );

    case "committing":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <FalcoPondering isLoading pose="thinking" size="md" label="Import en cours..." className="flex-col" />
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
            <Button onClick={() => handleCommit(step.payloads.map((p) => ({ ...p, confirmDuplicate: true })))}>Importer quand même</Button>
            <Button variant="secondary" onClick={() => handleAbandon("duplicate_confirm")}>
              Annuler
            </Button>
          </div>
        </div>
      );

    case "done":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="happy" size="md" animate="enter" className={falcoReactionClassName("value_imported")} />
          <p className="text-sm font-bold">
            C&apos;est rangé. {step.fieldsWritten} valeur{step.fieldsWritten > 1 ? "s" : ""} importée{step.fieldsWritten > 1 ? "s" : ""}, ton
            diagnostic est à jour.
          </p>
          {step.blockedFields.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {step.blockedFields.map((blocked) => (
                <p key={blocked.field}>{blocked.reason}</p>
              ))}
            </div>
          )}
        </div>
      );

    case "error":
      return (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Falco pose="sleeping" size="md" animate="enter" className={falcoReactionClassName("benign_error_parsing")} />
          <p className="text-sm text-state-critical">{step.message}</p>
          <Button variant="secondary" onClick={() => setStep({ kind: "dropzone" })}>
            Réessayer
          </Button>
        </div>
      );
  }
}
