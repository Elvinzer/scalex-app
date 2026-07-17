"use client";

import { useState, useTransition } from "react";

import { updateSettingKpiEntryField } from "./actions";
import type { EditableSettingKpiField } from "@/lib/setting/schema";

export function EditableKpiCell({
  entryId,
  field,
  value,
}: {
  entryId: string;
  field: EditableSettingKpiField;
  value: number;
}) {
  const [editing, setEditing] = useState(false);
  const [displayValue, setDisplayValue] = useState(value);
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEditing() {
    setDraft(String(displayValue));
    setError(null);
    setEditing(true);
  }

  function commit() {
    const parsed = Number(draft);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100_000) {
      setError("Entier entre 0 et 100 000");
      return;
    }

    setEditing(false);
    if (parsed === displayValue) return;

    const previous = displayValue;
    setDisplayValue(parsed);
    startTransition(async () => {
      const result = await updateSettingKpiEntryField(entryId, field, parsed);
      if (result.error) {
        setDisplayValue(previous);
        setError(result.error);
      }
    });
  }

  if (editing) {
    return (
      <td className="px-4 py-2.5">
        <input
          autoFocus
          type="number"
          inputMode="numeric"
          className="w-20 rounded border border-border bg-background px-1.5 py-1 font-mono tabular-nums outline-none ring-1 ring-ring"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setEditing(false);
              setError(null);
            }
          }}
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </td>
    );
  }

  return (
    <td
      className="cursor-pointer px-4 py-2.5 font-mono tabular-nums hover:bg-muted/50"
      onDoubleClick={startEditing}
      title="Double-clic pour modifier"
    >
      {displayValue}
      {isPending && <span className="ml-1 text-xs text-muted-foreground">…</span>}
    </td>
  );
}
