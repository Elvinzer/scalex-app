"use client";

import { ArrowRight, ClipboardPaste, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

const ACCEPTED = ".csv,.tsv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg";

export function ImportDropzone({
  onFilesSelected,
  disabled,
  allowPaste = false,
}: {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  allowPaste?: boolean;
}) {
  const t = useTranslations("data.importDropzone");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteValue, setPasteValue] = useState("");
  const inputId = useId();

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onFilesSelected(Array.from(fileList));
  }

  function handlePasteSubmit() {
    const value = pasteValue.trim();
    if (!value || disabled) return;
    onFilesSelected([
      new File([value], "tableau-colle.tsv", {
        type: "text/tab-separated-values",
      }),
    ]);
  }

  return (
    <div className="flex flex-col gap-2">
      {allowPaste && (
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-surface-sunken p-1" role="tablist" aria-label={t("sourceAria")}>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === "file"}
            onClick={() => setInputMode("file")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              inputMode === "file" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            {t("fileTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={inputMode === "paste"}
            onClick={() => setInputMode("paste")}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              inputMode === "paste" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ClipboardPaste className="size-4" aria-hidden="true" />
            {t("pasteTab")}
          </button>
        </div>
      )}

      {inputMode === "paste" && allowPaste ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[var(--radius-control)] border border-accent-2-border bg-accent-2-soft/60 p-3">
            <p className="text-sm font-bold text-accent-2-text">{t("pasteTitle")}</p>
            <p className="mt-1 text-xs text-accent-2-text/80">
              {t("pasteHelp")}
            </p>
          </div>
          <label htmlFor={inputId} className="text-sm font-bold">
            {t("pastedData")}
          </label>
          <textarea
            id={inputId}
            value={pasteValue}
            onChange={(event) => setPasteValue(event.target.value)}
            disabled={disabled}
            rows={7}
            placeholder={t("pastePlaceholder")}
            className="w-full resize-y rounded-[var(--radius-control)] border border-border bg-background px-3 py-3 font-mono text-xs leading-5 outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("pasteTip")}</p>
            <button
              type="button"
              onClick={handlePasteSubmit}
              disabled={disabled || pasteValue.trim().length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-transparent bg-accent-2 px-4 py-2 text-sm font-bold text-white shadow-[0_6px_16px_var(--accent-2-glow)] transition-all duration-[var(--motion-fast)] hover:bg-accent-2-hover hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-accent-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {t("analyze")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (!disabled) handleFiles(event.dataTransfer.files);
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`sticker-card-dashed flex min-h-40 flex-col items-center justify-center gap-2 p-6 text-center transition-colors ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          } ${isDragging ? "border-accent bg-accent-soft" : ""}`}
        >
          <Upload className="size-6 text-accent-2" aria-hidden="true" />
          <p className="text-sm font-bold">{t("drop")}</p>
          <p className="text-xs text-muted-foreground">{t("formats")}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            disabled={disabled}
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t("notStored")}
      </p>
    </div>
  );
}
