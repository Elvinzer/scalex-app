"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { Button } from "@/components/ui/button";
import { CRM_IMPORT_FIELDS } from "@/lib/import/schema";
import {
  crmImportAnalyzeResponseSchema,
  crmImportCommitResponseSchema,
  crmImportFieldSchema,
  crmImportPreviewResponseSchema,
  crmImportReviewSchema,
  crmImportSourceSchema,
  crmImportTargetSchema,
  type CrmImportCommitResponse,
  type CrmImportPreviewResponse,
  type CrmImportReview,
  type CrmImportSheet,
} from "@/lib/crm/import-schema";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";
import { sheetNeedsDefaultSource } from "@/lib/crm/import-source";

import { ImportDropzone } from "@/components/import/import-dropzone";

type Step = "dropzone" | "analyzing" | "mapping" | "preview" | "committing" | "done" | "error";

function valueLabel(value: string | number | null, emptyLabel: string): string {
  if (value === null || value === "") return emptyLabel;
  return String(value);
}

function issueLabel(t: ReturnType<typeof useTranslations<"crm">>, issue: string): string {
  if (issue === "missing_phone") return t("import.issues.missing_phone");
  if (issue === "invalid_phone") return t("import.issues.invalid_phone");
  if (issue === "missing_lead_created_at") return t("import.issues.missing_lead_created_at");
  if (issue === "missing_source") return t("import.issues.missing_source");
  if (issue === "invalid_email") return t("import.issues.invalid_email");
  if (issue === "unknown_offer") return t("import.issues.unknown_offer");
  if (issue === "unknown_setter") return t("import.issues.unknown_setter");
  if (issue === "no_lead_identity") return t("import.issues.no_lead_identity");
  if (issue === "multiple_existing_phone_matches") return t("import.issues.multiple_existing_phone_matches");
  if (issue === "profile_conflict") return t("import.issues.profile_conflict");
  return t("import.issues.generic");
}

export function CrmLeadImport() {
  const t = useTranslations("crm");
  const router = useRouter();
  const [step, setStep] = useState<Step>("dropzone");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [headerOverrides, setHeaderOverrides] = useState<Record<string, number>>({});
  const [review, setReview] = useState<CrmImportReview | null>(null);
  const [preview, setPreview] = useState<CrmImportPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [doneSummary, setDoneSummary] = useState<CrmImportCommitResponse | null>(null);

  async function analyze(files: File[], overrides: Record<string, number> = {}) {
    setStep("analyzing");
    setError(null);
    const formData = new FormData();
    for (const file of files) formData.append("files", file);
    formData.append("targetTableHint", "crm_leads");
    if (Object.keys(overrides).length > 0) formData.append("headerOverrides", JSON.stringify(overrides));
    try {
      const response = await fetch("/api/import/analyze", { method: "POST", body: formData });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : t("import.error");
        throw new Error(message);
      }
      const parsed = crmImportAnalyzeResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(t("import.error"));
      const nextReview = crmImportReviewSchema.parse({
        sheets: parsed.data.sheets.map((sheet) => ({ ...sheet, defaultSource: null })),
        keySource: parsed.data.keySource,
        tokens: parsed.data.tokens,
        duplicateDecisions: {},
        existingLeadDecisions: {},
        conflictChoices: {},
        missingPhoneDecisions: {},
        missingDateDecisions: {},
      });
      setReview(nextReview);
      setPreview(null);
      setStep("mapping");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("import.error"));
      setStep("error");
    }
  }

  async function handleFilesSelected(files: File[]) {
    setPendingFiles(files);
    setHeaderOverrides({});
    await analyze(files, {});
  }

  async function handleHeaderRowChosen(sheetName: string, rowIndex: number) {
    const nextOverrides = { ...headerOverrides, [sheetName]: rowIndex };
    setHeaderOverrides(nextOverrides);
    await analyze(pendingFiles, nextOverrides);
  }

  function updateReview(nextReview: CrmImportReview) {
    setReview(nextReview);
    setPreview(null);
  }

  function updateSheet(sheetIndex: number, updater: (sheet: CrmImportReview["sheets"][number]) => CrmImportReview["sheets"][number]) {
    if (!review) return;
    updateReview({
      ...review,
      sheets: review.sheets.map((sheet, index) => (index === sheetIndex ? updater(sheet) : sheet)),
    });
  }

  function updateMapping(sheetIndex: number, sourceColumn: string, rawTarget: string) {
    const target = crmImportFieldSchema.nullable().safeParse(rawTarget || null);
    updateSheet(sheetIndex, (sheet) => ({
      ...sheet,
      mapping: {
        ...sheet.mapping,
        mappings: sheet.mapping.mappings.map((mapping) =>
          mapping.sourceColumn === sourceColumn
            ? { ...mapping, targetField: target.success ? target.data : null }
            : mapping,
        ),
      },
    }));
  }

  function updateSource(sheetIndex: number, rawSource: string) {
    const source = crmImportSourceSchema.nullable().safeParse(rawSource || null);
    updateSheet(sheetIndex, (sheet) => ({ ...sheet, defaultSource: source.success ? source.data : null }));
  }

  function updateTargetTable(sheetIndex: number, rawTarget: string) {
    const target = crmImportTargetSchema.safeParse(rawTarget);
    if (!target.success) return;
    updateSheet(sheetIndex, (sheet) => ({
      ...sheet,
      mapping: {
        ...sheet.mapping,
        targetTable: target.data,
        ignoreReason: target.data === "ignore" ? sheet.mapping.ignoreReason ?? t("import.ignoredByUser") : null,
      },
    }));
  }

  async function requestPreview(nextReview = review) {
    if (!nextReview) return;
    setStep("analyzing");
    setError(null);
    try {
      const response = await fetch("/api/crm/import/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextReview),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : t("import.error");
        throw new Error(message);
      }
      const parsed = crmImportPreviewResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(t("import.error"));
      setPreview(parsed.data);
      setStep("preview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("import.error"));
      setStep("error");
    }
  }

  async function commit() {
    if (!review || !preview?.canCommit) return;
    setStep("committing");
    setError(null);
    try {
      const response = await fetch("/api/crm/import/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(review),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : t("import.error");
        throw new Error(message);
      }
      const parsed = crmImportCommitResponseSchema.safeParse(body);
      if (!parsed.success) throw new Error(t("import.error"));
      setDoneCount(parsed.data.create + parsed.data.update);
      setDoneSummary(parsed.data);
      setStep("done");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("import.error"));
      setStep("error");
    }
  }

  function setDuplicateDecision(groupId: string, value: "merge" | "skip") {
    if (!review) return;
    updateReview({ ...review, duplicateDecisions: { ...review.duplicateDecisions, [groupId]: value } });
  }

  function setExistingDecision(rowKey: string, value: "update" | "skip") {
    if (!review) return;
    updateReview({ ...review, existingLeadDecisions: { ...review.existingLeadDecisions, [rowKey]: value } });
  }

  function setMissingPhoneDecision(rowKey: string, value: "import" | "skip") {
    if (!review) return;
    updateReview({ ...review, missingPhoneDecisions: { ...review.missingPhoneDecisions, [rowKey]: value } });
  }

  function setMissingDateDecision(rowKey: string, value: "use_import_time" | "skip") {
    if (!review) return;
    updateReview({ ...review, missingDateDecisions: { ...review.missingDateDecisions, [rowKey]: value } });
  }

  function setConflictChoice(conflictId: string, value: "keep" | "replace") {
    if (!review) return;
    updateReview({ ...review, conflictChoices: { ...review.conflictChoices, [conflictId]: value } });
  }

  function startOver() {
    setStep("dropzone");
    setPendingFiles([]);
    setHeaderOverrides({});
    setReview(null);
    setPreview(null);
    setError(null);
    setDoneSummary(null);
  }

  if (step === "dropzone") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("import.description")}</p>
        <ImportDropzone onFilesSelected={handleFilesSelected} allowPaste accept=".csv,.tsv,.xlsx,.xls" formatLabel={t("import.formats")} />
      </div>
    );
  }

  if (step === "analyzing" || step === "committing") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <FalcoPondering isLoading pose="thinking" size="md" label={step === "analyzing" ? t("import.analyzing") : t("import.committing")} className="flex-col" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Falco pose="sleeping" size="md" animate="enter" />
        <p className="text-sm text-state-critical">{error ?? t("import.error")}</p>
        <Button variant="secondary" onClick={startOver}>{t("import.retry")}</Button>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Falco pose="happy" size="md" animate="enter" />
        <p className="text-sm font-bold">{doneSummary?.status === "already_committed" ? t("import.alreadyDone") : t("import.done", { count: doneCount })}</p>
        {doneSummary && <p className="max-w-xl text-sm text-muted-foreground">{t("import.doneSummary", {
          create: doneSummary.create,
          update: doneSummary.update,
          merged: doneSummary.merged,
          skipped: doneSummary.skipped,
          duplicates: doneSummary.duplicates,
        })}</p>}
        <Button variant="secondary" onClick={startOver}>{t("import.toggle")}</Button>
      </div>
    );
  }

  if (!review) return null;

  if (step === "mapping") {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h3 className="text-lg font-bold">{t("import.mappingTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("import.mappingHelp")}</p>
        </div>
        {review.sheets.map((sheet, sheetIndex) => (
          <MappingSheet
            key={sheet.fileName + sheet.sheetName}
            sheet={sheet}
            sheetIndex={sheetIndex}
            t={t}
            onTargetChange={updateMapping}
            onSourceChange={updateSource}
            onTargetTableChange={updateTargetTable}
            onHeaderRowChosen={handleHeaderRowChosen}
          />
        ))}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={startOver}>{t("import.cancel")}</Button>
          <Button variant="accent2" onClick={() => requestPreview()}>{t("import.continue")}</Button>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t("import.previewHelp")}</p>
        <Button variant="accent2" onClick={() => requestPreview()}>{t("import.refreshPreview")}</Button>
      </div>
    );
  }
  const reviewRows = preview.rows.filter((row) => row.action === "review");
  const existingRows = preview.rows.filter((row) => row.existingLeadId || row.issues.includes("multiple_existing_phone_matches") || row.issues.includes("profile_conflict"));
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold">{t("import.previewTitle")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("import.previewHelp")}</p>
        <p className="mt-2 text-sm font-bold">{t("import.counts", preview.counts)}</p>
      </div>

      {preview.rows.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-state-warning/40 bg-state-warning/10 p-4 text-sm">
          {t("import.noRows")}
        </div>
      ) : (
        <section className="overflow-hidden rounded-[var(--radius-control)] border border-border">
          <div className="border-b border-border bg-surface-sunken p-4">
            <h4 className="font-bold">{t("import.rowsTitle")}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{t("import.rowsHelp")}</p>
            {preview.rows.length > 50 && <p className="mt-1 text-xs text-muted-foreground">{t("import.rowsShown", { count: 50, total: preview.rows.length })}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border bg-card text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t("import.rowNumber")}</th>
                  <th className="px-4 py-3">{t("import.fields.displayName")}</th>
                  <th className="px-4 py-3">{t("import.fields.phone")}</th>
                  <th className="px-4 py-3">{t("import.fields.leadCreatedAt")}</th>
                  <th className="px-4 py-3">{t("import.fields.source")}</th>
                  <th className="px-4 py-3">{t("import.fields.platform")}</th>
                  <th className="px-4 py-3">{t("import.fields.stage")}</th>
                  <th className="px-4 py-3">{t("import.fields.outcome")}</th>
                  <th className="px-4 py-3">{t("import.target")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 50).map((row) => (
                  <tr key={row.rowKey} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs">{row.rowIndex + 1}</td>
                    <td className="max-w-52 px-4 py-3">{valueLabel(row.values.displayName ?? row.values.handle ?? null, t("import.emptyValue"))}</td>
                    <td className="px-4 py-3 font-mono text-xs">{valueLabel(row.values.phone ?? null, t("import.emptyValue"))}</td>
                    <td className="px-4 py-3 text-xs">{valueLabel(row.values.leadCreatedAt ?? null, t("import.emptyValue")).slice(0, 10)}</td>
                    <td className="px-4 py-3">{valueLabel(row.values.source ?? null, t("import.emptyValue"))}</td>
                    <td className="px-4 py-3">{valueLabel(row.values.platform ?? null, t("import.emptyValue"))}</td>
                    <td className="px-4 py-3">{valueLabel(row.values.stage ?? "first_message_sent", t("import.emptyValue"))}</td>
                    <td className="px-4 py-3">{valueLabel(row.values.outcome ?? "none", t("import.emptyValue"))}</td>
                    <td className="px-4 py-3 font-bold">{t("import.rowAction." + row.action)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {preview.duplicateGroups.length > 0 && (
        <section className="rounded-[var(--radius-control)] border border-state-warning/40 bg-state-warning/10 p-4">
          <h4 className="font-bold">{t("import.duplicatesTitle")}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t("import.duplicatesHelp")}</p>
          <div className="mt-3 flex flex-col gap-3">
            {preview.duplicateGroups.map((group) => {
              const groupRows = preview.rows.filter((row) => group.rowKeys.includes(row.rowKey));
              return <div key={group.id} className="flex flex-col gap-2 rounded border border-border p-3">
                <p className="text-xs text-muted-foreground">{t("import.rows", { numbers: groupRows.map((row) => String(row.rowIndex + 1)).join(", ") })}</p>
                <label className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="font-mono">{group.phoneNormalized ?? t("import.missingPhone")}</span>
                  <select
                    value={review.duplicateDecisions[group.id] ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "merge" || value === "skip") setDuplicateDecision(group.id, value);
                    }}
                    className="min-h-10 rounded border border-border bg-background px-2"
                  >
                    <option value="">{t("import.chooseDecision")}</option>
                    <option value="merge">{t("import.merge")}</option>
                    <option value="skip">{t("import.skipDuplicates")}</option>
                  </select>
                </label>
                {group.conflicts.map((field) => {
                  const conflictId = group.id + ":" + field;
                  return (
                    <label key={field} className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{t("import.fields." + field)}</span>
                      <select
                        value={review.conflictChoices[conflictId] === "replace" ? "replace" : review.conflictChoices[conflictId] === "keep" ? "keep" : ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value === "keep" || value === "replace") setConflictChoice(conflictId, value);
                        }}
                        className="min-h-9 rounded border border-border bg-background px-2 text-foreground"
                      >
                        <option value="">{t("import.chooseDecision")}</option>
                        <option value="keep">{t("import.keep")}</option>
                        <option value="replace">{t("import.replace")}</option>
                      </select>
                    </label>
                  );
                })}
              </div>;
            })}
          </div>
        </section>
      )}

      {existingRows.length > 0 && (
        <section className="rounded-[var(--radius-control)] border border-border p-4">
          <h4 className="font-bold">{t("import.existingTitle")}</h4>
          {existingRows.some((row) => row.issues.includes("multiple_existing_phone_matches")) && <p className="mt-1 text-sm text-muted-foreground">{t("import.multipleExistingHelp")}</p>}
          {existingRows.some((row) => row.issues.includes("profile_conflict")) && <p className="mt-1 text-sm text-muted-foreground">{t("import.profileConflictHelp")}</p>}
          <div className="mt-3 flex flex-col gap-3">
            {existingRows.map((row) => (
              <label key={row.rowKey} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{row.issues.includes("multiple_existing_phone_matches") ? t("import.multipleExistingRow", { number: row.rowIndex + 1 }) : row.issues.includes("profile_conflict") ? t("import.profileConflictRow", { number: row.rowIndex + 1 }) : t("import.row", { number: row.rowIndex + 1 })}</span>
                <select
                  value={review.existingLeadDecisions[row.rowKey] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "update" || value === "skip") setExistingDecision(row.rowKey, value);
                  }}
                  className="min-h-10 rounded border border-border bg-background px-2"
                  >
                    <option value="">{t("import.chooseDecision")}</option>
                  {!row.issues.some((issue) => issue === "multiple_existing_phone_matches" || issue === "profile_conflict") && <option value="update">{t("import.update")}</option>}
                  <option value="skip">{t("import.skipRow")}</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {preview.rows.some((row) => !row.issues.includes("profile_conflict") && (row.issues.includes("missing_phone") || row.issues.includes("invalid_phone"))) && (
        <section className="rounded-[var(--radius-control)] border border-border p-4">
          <h4 className="font-bold">{t("import.missingPhone")}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t("import.missingPhoneHelp")}</p>
          <div className="mt-3 flex flex-col gap-3">
            {preview.rows.filter((row) => row.action !== "merged" && !row.issues.includes("profile_conflict") && (row.issues.includes("missing_phone") || row.issues.includes("invalid_phone"))).map((row) => (
              <label key={row.rowKey} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{t("import.row", { number: row.rowIndex + 1 })}</span>
                <select
                  value={review.missingPhoneDecisions[row.rowKey] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "import" || value === "skip") setMissingPhoneDecision(row.rowKey, value);
                  }}
                  className="min-h-10 rounded border border-border bg-background px-2"
                >
                  <option value="">{t("import.chooseDecision")}</option>
                  <option value="import">{t("import.importWithoutPhone")}</option>
                  <option value="skip">{t("import.skipRow")}</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {preview.rows.some((row) => !row.issues.includes("profile_conflict") && row.issues.includes("missing_lead_created_at")) && (
        <section className="rounded-[var(--radius-control)] border border-border p-4">
          <h4 className="font-bold">{t("import.missingDate")}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t("import.missingDateHelp")}</p>
          <div className="mt-3 flex flex-col gap-3">
            {preview.rows.filter((row) => row.action !== "merged" && !row.issues.includes("profile_conflict") && row.issues.includes("missing_lead_created_at")).map((row) => (
              <label key={row.rowKey} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>{t("import.row", { number: row.rowIndex + 1 })}</span>
                <select
                  value={review.missingDateDecisions[row.rowKey] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "use_import_time" || value === "skip") setMissingDateDecision(row.rowKey, value);
                  }}
                  className="min-h-10 rounded border border-border bg-background px-2"
                >
                  <option value="">{t("import.chooseDecision")}</option>
                  <option value="use_import_time">{t("import.useImportTime")}</option>
                  <option value="skip">{t("import.skipRow")}</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {preview.conflicts.length > 0 && (
        <section className="rounded-[var(--radius-control)] border border-border p-4">
          <h4 className="font-bold">{t("import.conflictsTitle")}</h4>
          <div className="mt-3 flex flex-col gap-3">
            {preview.conflicts.map((conflict) => (
              <label key={conflict.id} className="grid gap-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
                <span>
                  {t("import.fields." + conflict.field)}: {valueLabel(conflict.existingValue, t("import.emptyValue"))} → {valueLabel(conflict.importedValue, t("import.emptyValue"))}
                </span>
                <select
                  value={review.conflictChoices[conflict.id] === "replace" ? "replace" : review.conflictChoices[conflict.id] === "keep" ? "keep" : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "keep" || value === "replace") setConflictChoice(conflict.id, value);
                  }}
                  className="min-h-10 rounded border border-border bg-background px-2"
                >
                  <option value="">{t("import.chooseDecision")}</option>
                  <option value="keep">{t("import.keep")}</option>
                  <option value="replace">{t("import.replace")}</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {reviewRows.length > 0 && (
        <section className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 p-4">
          <p className="text-sm font-bold">{t("import.blocked")}</p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {reviewRows.slice(0, 12).map((row) => (
              <li key={row.rowKey}>{t("import.row", { number: row.rowIndex + 1 })}: {row.issues.map((issue) => issueLabel(t, issue)).join(", ")}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" onClick={() => { setStep("mapping"); setPreview(null); }}>{t("import.back")}</Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => requestPreview()}>{t("import.refreshPreview")}</Button>
          <Button variant="accent2" onClick={commit} disabled={!preview.canCommit}>{t("import.commit")}</Button>
        </div>
      </div>
    </div>
  );
}

function MappingSheet({
  sheet,
  sheetIndex,
  t,
  onTargetChange,
  onSourceChange,
  onTargetTableChange,
  onHeaderRowChosen,
}: {
  sheet: CrmImportSheet;
  sheetIndex: number;
  t: ReturnType<typeof useTranslations<"crm">>;
  onTargetChange: (sheetIndex: number, sourceColumn: string, targetField: string) => void;
  onSourceChange: (sheetIndex: number, source: string) => void;
  onTargetTableChange: (sheetIndex: number, target: string) => void;
  onHeaderRowChosen: (sheetName: string, rowIndex: number) => void;
}) {
  const isIgnored = sheet.mapping.targetTable === "ignore";
  const needsSource = !isIgnored && !sheet.defaultSource && sheetNeedsDefaultSource(sheet);
  return (
    <section className="overflow-hidden rounded-[var(--radius-control)] border border-border">
      <div className="border-b border-border bg-surface-sunken p-4">
        <p className="text-sm font-bold">{t("import.file", { name: sheet.fileName })}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("import.sheet", { name: sheet.sheetName })}</p>
        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
          {t("import.sheetTarget")}
          <select
            value={sheet.mapping.targetTable}
            onChange={(event) => onTargetTableChange(sheetIndex, event.target.value)}
            className="min-h-9 rounded border border-border bg-background px-2 font-normal"
          >
            <option value="crm_leads">{t("import.crmLeads")}</option>
            <option value="ignore">{t("import.ignoreSheet")}</option>
          </select>
        </label>
        {!sheet.headerRowConfident && <p className="mt-2 text-xs text-state-warning">{t("import.headerWarning")}</p>}
      </div>
      {!sheet.headerRowConfident && (
        <div className="border-b border-border bg-state-warning/10 p-4">
          <p className="text-sm font-bold">{t("import.headerQuestion")}</p>
          <div className="mt-3 overflow-x-auto rounded border border-border bg-background p-2">
            <table className="w-full min-w-[520px] text-left text-xs">
              <tbody>
                {sheet.previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-2 font-bold text-muted-foreground">{rowIndex + 1}</td>
                    {row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-2 py-2">{cell || t("import.emptyValue")}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {sheet.previewRows.map((_, rowIndex) => (
              <Button key={rowIndex} variant="secondary" onClick={() => onHeaderRowChosen(sheet.sheetName, rowIndex)}>
                {t("import.headerRow", { number: rowIndex + 1 })}
              </Button>
            ))}
          </div>
        </div>
      )}
      {isIgnored ? (
        <div className="border-b border-border bg-surface-sunken p-4">
          <p className="text-sm font-bold">{t("import.sheetIgnored")}</p>
          {sheet.mapping.ignoreReason && <p className="mt-1 text-xs text-muted-foreground">{sheet.mapping.ignoreReason}</p>}
        </div>
      ) : needsSource ? (
        <div className="border-b border-border bg-accent-2-soft/40 p-4">
          <label className="flex flex-col gap-2 text-sm font-bold">
            {t("import.sourceQuestion")}
            <select
              value={sheet.defaultSource ?? ""}
              onChange={(event) => onSourceChange(sheetIndex, event.target.value)}
              className="min-h-11 rounded border border-border bg-background px-2 font-normal"
            >
              <option value="">{t("import.chooseSource")}</option>
              {CRM_LEAD_SOURCES.map((source) => <option key={source} value={source}>{t("leads.sourceOptions." + source)}</option>)}
            </select>
            <span className="text-xs font-normal text-muted-foreground">{t("import.sourceHelp")}</span>
          </label>
        </div>
      ) : null}
      {!isIgnored && <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border bg-card text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">{t("import.column")}</th>
              <th className="px-4 py-3">{t("import.target")}</th>
              <th className="px-4 py-3">{t("import.confidence")}</th>
              <th className="px-4 py-3">{t("import.examples")}</th>
            </tr>
          </thead>
          <tbody>
            {sheet.mapping.mappings.map((mapping) => (
              <tr key={mapping.sourceColumn} className="border-b border-border last:border-b-0">
                <td className="max-w-64 px-4 py-3 align-top font-medium">{mapping.sourceColumn}</td>
                <td className="px-4 py-3 align-top">
                  <select
                    value={mapping.targetField ?? ""}
                    onChange={(event) => onTargetChange(sheetIndex, mapping.sourceColumn, event.target.value)}
                    className="min-h-10 max-w-56 rounded border border-border bg-background px-2"
                  >
                    <option value="">{t("import.ignore")}</option>
                    {CRM_IMPORT_FIELDS.map((field) => <option key={field} value={field}>{t("import.fields." + field)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 align-top text-xs text-muted-foreground">{t("import." + mapping.confidence)}</td>
                <td className="max-w-72 px-4 py-3 align-top text-xs text-muted-foreground">{mapping.sampleValues.filter(Boolean).slice(0, 3).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  );
}
