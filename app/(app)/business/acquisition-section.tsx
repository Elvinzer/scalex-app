"use client";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { BusinessAcquisition, LeadMagnetType, Platform } from "@/lib/business/types";

import { saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const PLATFORM_NAMES = [
  "YouTube",
  "TikTok",
  "Instagram",
  "LinkedIn",
  "X",
  "Newsletter",
  "Site web",
  "Autre",
];

const LEAD_MAGNET_TYPES: { value: LeadMagnetType; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "video", label: "Vidéo" },
  { value: "formation_gratuite", label: "Formation gratuite" },
  { value: "communaute", label: "Communauté" },
  { value: "audit", label: "Audit" },
  { value: "autre", label: "Autre" },
];

export function AcquisitionSection({
  value,
  onChange,
}: {
  value: BusinessAcquisition;
  onChange: (next: BusinessAcquisition) => void;
}) {
  const { schedule, status, error } = useDebouncedSave<BusinessAcquisition>((next) =>
    saveBusinessSection("acquisition", next)
  );

  function update(patch: Partial<BusinessAcquisition>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  function togglePlatform(name: string, active: boolean) {
    const platforms = active
      ? [...value.platforms, { name, url: "", postsPerWeek: null }]
      : value.platforms.filter((platform) => platform.name !== name);
    update({ platforms });
  }

  function updatePlatform(name: string, patch: Partial<Platform>) {
    update({
      platforms: value.platforms.map((platform) =>
        platform.name === name ? { ...platform, ...patch } : platform
      ),
    });
  }

  const completion = computeSectionCompletion("acquisition", value);

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">Acquisition</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Comment tes prospects te trouvent.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold">Plateformes actives</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_NAMES.map((name) => {
              const active = value.platforms.some((platform) => platform.name === name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => togglePlatform(name, !active)}
                  className={
                    active
                      ? "rounded-full border border-signal bg-signal/15 px-3 py-1.5 text-sm font-bold text-signal"
                      : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-signal/50"
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>

          {value.platforms.length > 0 && (
            <div className="mt-2 flex flex-col gap-3">
              {value.platforms.map((platform) => (
                <div
                  key={platform.name}
                  className="grid gap-3 rounded-xl border border-dashed border-border p-4 sm:grid-cols-[1fr_auto]"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-bold text-muted-foreground">{platform.name} — lien</span>
                      <input
                        type="text"
                        value={platform.url}
                        onChange={(event) => updatePlatform(platform.name, { url: event.target.value })}
                        placeholder="https://..."
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-bold text-muted-foreground">Posts / semaine</span>
                      <input
                        type="number"
                        min={0}
                        value={platform.postsPerWeek ?? ""}
                        onChange={(event) =>
                          updatePlatform(platform.name, {
                            postsPerWeek: event.target.value === "" ? null : Number(event.target.value),
                          })
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ConditionalBlock
          title="Lead magnet"
          enabled={value.leadMagnet.enabled}
          onEnabledChange={(enabled) => update({ leadMagnet: { ...value.leadMagnet, enabled } })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Type</span>
              <select
                value={value.leadMagnet.type ?? ""}
                onChange={(event) =>
                  update({
                    leadMagnet: {
                      ...value.leadMagnet,
                      type: event.target.value === "" ? null : (event.target.value as LeadMagnetType),
                    },
                  })
                }
                className={inputClass}
              >
                <option value="">Choisir...</option>
                {LEAD_MAGNET_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Titre</span>
              <input
                type="text"
                value={value.leadMagnet.title}
                onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, title: event.target.value } })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Promesse</span>
            <input
              type="text"
              value={value.leadMagnet.promise}
              onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, promise: event.target.value } })}
              placeholder="Ce que ton lead magnet promet concrètement"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Lien</span>
            <input
              type="text"
              value={value.leadMagnet.url}
              onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, url: event.target.value } })}
              className={inputClass}
            />
          </label>
        </ConditionalBlock>

        <ConditionalBlock
          title="VSL"
          enabled={value.vsl.enabled}
          onEnabledChange={(enabled) => update({ vsl: { ...value.vsl, enabled } })}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">Lien</span>
            <input
              type="text"
              value={value.vsl.url}
              onChange={(event) => update({ vsl: { ...value.vsl, url: event.target.value } })}
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Durée (min)</span>
              <input
                type="number"
                min={0}
                value={value.vsl.durationMin ?? ""}
                onChange={(event) =>
                  update({
                    vsl: { ...value.vsl, durationMin: event.target.value === "" ? null : Number(event.target.value) },
                  })
                }
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">CTA principal</span>
              <input
                type="text"
                value={value.vsl.cta}
                onChange={(event) => update({ vsl: { ...value.vsl, cta: event.target.value } })}
                className={inputClass}
              />
            </label>
          </div>
        </ConditionalBlock>

        <ConditionalBlock
          title="Setting"
          enabled={value.setting.enabled}
          onEnabledChange={(enabled) => update({ setting: { ...value.setting, enabled } })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Canal</span>
              <input
                type="text"
                value={value.setting.channel}
                onChange={(event) => update({ setting: { ...value.setting, channel: event.target.value } })}
                placeholder="WhatsApp, DM Instagram..."
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">Qui set</span>
              <input
                type="text"
                value={value.setting.operator}
                onChange={(event) => update({ setting: { ...value.setting, operator: event.target.value } })}
                placeholder="Moi, setter salarié, setter commission..."
                className={inputClass}
              />
            </label>
          </div>
        </ConditionalBlock>
      </div>
    </div>
  );
}

function ConditionalBlock({
  title,
  enabled,
  onEnabledChange,
  children,
}: {
  title: string;
  enabled: "yes" | "no" | null;
  onEnabledChange: (value: "yes" | "no") => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold">{title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEnabledChange("yes")}
            className={
              enabled === "yes"
                ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-bold text-signal"
                : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
            }
          >
            Oui
          </button>
          <button
            type="button"
            onClick={() => onEnabledChange("no")}
            className={
              enabled === "no"
                ? "rounded-full border border-signal bg-signal/15 px-3 py-1 text-xs font-bold text-signal"
                : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
            }
          >
            Non
          </button>
        </div>
      </div>
      {enabled === "yes" && <div className="mt-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
