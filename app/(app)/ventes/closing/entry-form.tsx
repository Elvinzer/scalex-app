"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { saveClosingKpiEntry } from "./actions";

const COUNT_FIELDS = [
  { name: "callsAttended", label: "Appels pris" },
  { name: "salesClosed", label: "Ventes conclues" },
] as const;

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
        <span className="text-muted-foreground">Date</span>
        <input
          type="date"
          name="date"
          required
          max={today()}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        {COUNT_FIELDS.map((field) => (
          <label key={field.name} className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">{field.label}</span>
            <input
              type="number"
              name={field.name}
              min={0}
              max={100_000}
              required
              value={counts[field.name] ?? ""}
              onChange={(event) =>
                setCounts((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
              className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
            />
          </label>
        ))}
      </div>

      {error && <p className="text-sm text-state-critical">{error}</p>}
      {savedDate && !error && (
        <p className="text-sm text-state-healthy">
          {savedDate} enregistré, au tour du {nextDay(savedDate)}.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Enregistrement..." : "Enregistrer ce jour"}
      </Button>
    </form>
  );
}
