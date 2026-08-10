"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { saveClosingKpiEntry } from "./actions";

const COUNT_FIELDS = [
  { name: "callsAttended", labelKey: "callsAttended" },
  { name: "salesClosed", labelKey: "salesClosed" },
] as const;

const INPUT_CLASS =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

// Same fixed-height treatment as the Setting entry form, so a label that
// wraps to two lines never pushes its input out of alignment with its
// neighbors in the row.
const FIELD_LABEL_CLASS = "min-h-9 leading-tight text-muted-foreground";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const iso = next.toISOString().slice(0, 10);
  return iso > today() ? today() : iso;
}

export function EntryForm() {
  const t = useTranslations("sales.closingFunnel");
  const [date, setDate] = useState(today);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setSavedDate(null);

    startTransition(async () => {
      const result = await saveClosingKpiEntry(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedDate(date);
      setCounts({});
      setDate(nextDay(date));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">{t("date")}</span>
        <input
          type="date"
          name="date"
          required
          max={today()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={`${INPUT_CLASS} sm:w-56`}
        />
      </label>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4">
        {COUNT_FIELDS.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-sm">
            <span className={FIELD_LABEL_CLASS}>{t(field.labelKey)}</span>
            <input
              type="number"
              name={field.name}
              min={0}
              max={100_000}
              required
              placeholder="0"
              value={counts[field.name] ?? ""}
              onChange={(event) =>
                setCounts((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
              className={INPUT_CLASS}
            />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-state-critical">{error}</p>}
      {savedDate && !error && (
        <p className="text-sm text-state-healthy">
          {t("saved", { date: savedDate, next: nextDay(savedDate) })}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? t("saving") : t("saveDay")}
      </Button>
    </form>
  );
}
