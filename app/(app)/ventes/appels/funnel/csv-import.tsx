"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { importClosingKpiCsv, type ImportClosingKpiCsvResult } from "./actions";

export function CsvImport() {
  const t = useTranslations("sales.closingFunnel");
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportClosingKpiCsvResult | null>(null);
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
      setFileError(t("readError"));
      return;
    }

    startTransition(async () => {
      const outcome = await importClosingKpiCsv(text);
      setResult(outcome);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("csvHelp")}
      </p>

      <a
        href="/closing-kpis-template.csv"
        download
        className="self-start text-sm font-bold text-primary underline underline-offset-4"
      >
        {t("downloadTemplate")}
      </a>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={isPending}
          className="text-sm text-muted-foreground file:mr-4 file:rounded-full file:border file:border-ink file:bg-ink file:px-4 file:py-2 file:text-sm file:font-bold file:text-mist file:hover:opacity-90"
        />
      </div>

      {isPending && <p className="text-sm text-muted-foreground">{t("importing")}</p>}
      {fileError && <p className="text-sm text-state-critical">{fileError}</p>}

      {result && (
        <div className="rounded-xl border border-border bg-muted p-4 text-sm">
          <p className="font-bold">
            {result.imported > 0
              ? t("imported", { count: result.imported, plural: result.imported > 1 ? "s" : "" })
              : t("noImported")}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-state-critical">
              {result.errors.map((error, index) => (
                <li key={index}>
                  {error.line > 0 ? t("line", { line: error.line }) : ""}
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
