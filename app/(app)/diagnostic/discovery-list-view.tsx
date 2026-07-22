"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { LeverCatalogEntry } from "@/lib/levers/catalog";

import { saveLeverAnswer, updateLeverStats } from "./discovery-actions";

export type EditableLever = {
  catalog: LeverCatalogEntry;
  status: "active" | "absent";
  stats: Record<string, number | string>;
};

function LeverRow({ lever }: { lever: EditableLever }) {
  const [status, setStatus] = useState(lever.status);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(lever.catalog.questions.slice(1).map((q) => [q.key, String(lever.stats[q.key] ?? "")]))
  );
  const [isPending, setIsPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleToggleStatus() {
    const next = status === "active" ? "absent" : "active";
    setIsPending(true);
    await saveLeverAnswer(lever.catalog.leverKey, next, next === "active" ? lever.stats : {});
    setStatus(next);
    setIsPending(false);
  }

  async function handleSaveStats() {
    setIsPending(true);
    const numericStats: Record<string, number | string> = {};
    for (const [key, raw] of Object.entries(draft)) {
      const num = Number(raw);
      numericStats[key] = raw.trim() !== "" && !Number.isNaN(num) ? num : raw;
    }
    await updateLeverStats(lever.catalog.leverKey, numericStats);
    setIsPending(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const statQuestions = lever.catalog.questions.slice(1);

  return (
    <div className="sticker-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold">{lever.catalog.label}</p>
        <Button size="sm" variant="outline" onClick={() => void handleToggleStatus()} disabled={isPending}>
          {status === "active" ? "Actif — marquer absent" : "Absent — marquer actif"}
        </Button>
      </div>

      {status === "active" && statQuestions.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {statQuestions.map((question) => (
            <label key={question.key} className="flex flex-col gap-1 text-xs">
              <span className="font-bold text-muted-foreground">{question.prompt}</span>
              <input
                type={question.kind === "stat_number" ? "number" : "text"}
                value={draft[question.key] ?? ""}
                onChange={(event) => setDraft((prev) => ({ ...prev, [question.key]: event.target.value }))}
                className="rounded-[var(--radius-control)] border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-accent"
              />
            </label>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void handleSaveStats()} disabled={isPending} className="self-start">
            {saved ? "Enregistré ✓" : "Enregistrer"}
          </Button>
        </div>
      )}
    </div>
  );
}

// Field-by-field editing after the parcours — "sans refaire la
// conversation" (brief's own phrasing). Only shows levers the user
// actually answered (profile-backed levers are edited via Mon business,
// not duplicated here — single source of truth).
export function DiscoveryListView({ levers }: { levers: EditableLever[] }) {
  if (levers.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-muted-foreground">Tes réponses</h3>
      {levers.map((lever) => (
        <LeverRow key={lever.catalog.leverKey} lever={lever} />
      ))}
    </div>
  );
}
