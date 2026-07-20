"use client";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { BusinessIdentity } from "@/lib/business/types";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

export function IdentitySection({
  value,
  onChange,
}: {
  value: BusinessIdentity;
  onChange: (next: BusinessIdentity) => void;
}) {
  const { schedule, status, error } = useDebouncedSave<BusinessIdentity>((next) =>
    saveBusinessSection("identity", next)
  );

  function update(patch: Partial<BusinessIdentity>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  const completion = computeSectionCompletion("identity", value);

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Identité &amp; avatar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Décris qui tu vends et à qui.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Nom du business</span>
          <input
            type="text"
            value={value.businessName}
            onChange={(event) => update({ businessName: event.target.value })}
            placeholder="Ex : Scale X"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Niche / marché</span>
          <input
            type="text"
            value={value.niche}
            onChange={(event) => update({ niche: event.target.value })}
            placeholder="Ex : coaching business pour thérapeutes indépendants"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Avatar client</span>
          <span className="text-xs text-muted-foreground">
            Qui c&apos;est, son problème principal, son niveau de conscience.
          </span>
          <textarea
            value={value.avatarDescription}
            onChange={(event) => update({ avatarDescription: event.target.value })}
            rows={4}
            placeholder="Décris ton client idéal..."
            className={inputClass}
          />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">CA mensuel actuel (€)</span>
            <input
              type="number"
              min={0}
              value={value.mrrCurrent ?? ""}
              onChange={(event) =>
                update({ mrrCurrent: event.target.value === "" ? null : Number(event.target.value) })
              }
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Objectif de CA (€)</span>
            <input
              type="number"
              min={0}
              value={value.mrrGoal ?? ""}
              onChange={(event) =>
                update({ mrrGoal: event.target.value === "" ? null : Number(event.target.value) })
              }
              className={inputClass}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Mode d&apos;acquisition principal</span>
          <select
            value={value.acquisitionMode ?? ""}
            onChange={(event) =>
              update({
                acquisitionMode: event.target.value === "" ? null : (event.target.value as BusinessIdentity["acquisitionMode"]),
              })
            }
            className={inputClass}
          >
            <option value="">Non renseigné</option>
            <option value="organique">Organique</option>
            <option value="ads">Ads</option>
            <option value="hybride">Hybride</option>
          </select>
        </label>
      </div>
    </div>
  );
}
