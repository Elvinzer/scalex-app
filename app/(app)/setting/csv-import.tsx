"use client";

import { useRef, useState, useTransition } from "react";

import { importSettingKpiCsv, type ImportSettingKpiCsvResult } from "./actions";

export function CsvImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportSettingKpiCsvResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileError(null);
    setResult(null);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileError("Impossible de lire ce fichier.");
      return;
    }

    startTransition(async () => {
      const outcome = await importSettingKpiCsv(text);
      setResult(outcome);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Un fichier avec une ligne par jour — les jours déjà enregistrés sont mis à jour,
        pas dupliqués.
      </p>

      <a
        href="/setting-kpis-template.csv"
        download
        className="self-start text-sm font-medium text-primary underline underline-offset-4"
      >
        Télécharger le modèle CSV
      </a>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={isPending}
          className="text-sm text-muted-foreground file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground file:hover:bg-primary/90"
        />
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Import en cours...</p>}
      {fileError && <p className="text-sm text-state-critical">{fileError}</p>}

      {result && (
        <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <p className="font-medium">
            {result.imported > 0
              ? `${result.imported} jour${result.imported > 1 ? "s" : ""} importé${result.imported > 1 ? "s" : ""}`
              : "Aucune ligne importée"}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-state-critical">
              {result.errors.map((error, index) => (
                <li key={index}>
                  {error.line > 0 ? `Ligne ${error.line} — ` : ""}
                  {error.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
