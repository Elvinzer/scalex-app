"use client";

import { useTransition } from "react";

import { SECTOR_KEYS, SECTOR_LABELS, type SectorKey } from "@/lib/benchmarks";
import { updateSector } from "@/lib/user-actions";

export function SectorPicker({ sector }: { sector: SectorKey | null }) {
  const [isPending, startTransition] = useTransition();

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value || null;
    startTransition(async () => {
      await updateSector(value);
    });
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted-foreground">Ton secteur</span>
      <select
        defaultValue={sector ?? ""}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
      >
        <option value="">Non renseigné (repère global)</option>
        {SECTOR_KEYS.map((key) => (
          <option key={key} value={key}>
            {SECTOR_LABELS[key]}
          </option>
        ))}
      </select>
    </label>
  );
}
