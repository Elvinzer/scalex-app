"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ArrowDown, Route, PencilLine } from "lucide-react";

import { computeSectionCompletion } from "@/lib/business/completion";
import type { BusinessAcquisition, LeadMagnetType, Platform } from "@/lib/business/types";
import type { FunnelBlockCatalogEntry, FunnelBlockSelectionItem, FunnelSourceKey } from "@/lib/funnel-blocks/types";
import { FunnelBlockBuilder, type FunnelBlockBuilderPayload } from "@/components/funnel-block-builder";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { saveAcquisitionBlocks, saveBusinessSection } from "./actions";
import { CompletionBadge, SaveIndicator } from "./save-indicator";
import { useDebouncedSave } from "./use-debounced-save";

const inputClass =
  "rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12";

const PLATFORM_NAMES: { value: string; labelKey?: string }[] = [
  { value: "YouTube" },
  { value: "TikTok" },
  { value: "Instagram" },
  { value: "LinkedIn" },
  { value: "X" },
  { value: "Newsletter" },
  { value: "Site web", labelKey: "website" },
  { value: "Autre", labelKey: "other" },
];

const LEAD_MAGNET_TYPES: { value: LeadMagnetType; labelKey: string }[] = [
  { value: "pdf", labelKey: "pdf" },
  { value: "video", labelKey: "video" },
  { value: "formation_gratuite", labelKey: "freeTraining" },
  { value: "communaute", labelKey: "community" },
  { value: "audit", labelKey: "audit" },
  { value: "autre", labelKey: "other" },
];

export function AcquisitionSection({
  value,
  blockCatalog,
  onChange,
}: {
  value: BusinessAcquisition;
  blockCatalog: FunnelBlockCatalogEntry[];
  onChange: (next: BusinessAcquisition) => void;
}) {
  const t = useTranslations("business.acquisition");
  const tSource = useTranslations("funnelBlocks.sources");
  const tFamily = useTranslations("funnelBlocks.families");
  const tCatalog = useTranslations("funnelBlocks.catalog");
  const { schedule, status, error } = useDebouncedSave<BusinessAcquisition>((next) =>
    saveBusinessSection("acquisition", next)
  );
  const [funnelEditorOpen, setFunnelEditorOpen] = useState(false);
  const [inferredNoticeDismissed, setInferredNoticeDismissed] = useState(false);

  function update(patch: Partial<BusinessAcquisition>) {
    const next = { ...value, ...patch };
    onChange(next);
    schedule(next);
  }

  async function saveBlocks(payload: FunnelBlockBuilderPayload) {
    const result = await saveAcquisitionBlocks(payload, "settings");
    if (!result.error) {
      onChange({ ...value, blocks: payload.blocks, sources: payload.sources, blockSelectionInferred: false });
      setFunnelEditorOpen(false);
    }
    return result;
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
  const activeBlocks = value.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item: FunnelBlockSelectionItem) => blockCatalog.find((entry) => entry.blockKey === item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined);

  return (
    <div className="sticker-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("help")}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <CompletionBadge answered={completion.answered} total={completion.total} />
          <SaveIndicator status={status} error={error} />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {value.blockSelectionInferred && !inferredNoticeDismissed && (
          <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/45 p-4">
            <p className="text-sm font-bold">{t("inferredTitle")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("inferredHelp")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setFunnelEditorOpen(true)}>{t("inferredCta")}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setInferredNoticeDismissed(true)}>{t("inferredDismiss")}</Button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-accent-border bg-accent-soft/45 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-accent-text">
                <Route className="size-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold">{t("funnelTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("funnelHelp")}</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setFunnelEditorOpen(true)}>
              <PencilLine className="size-3.5" aria-hidden="true" />
            {t("editFunnel")}
          </Button>
          </div>
          <div className="mt-5 flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-background p-4" aria-labelledby="business-journey-preview-title">
              <p id="business-journey-preview-title" className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">
                {t("journeyPreviewEyebrow")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("journeyPreviewHelp")}</p>
              <ol className="mt-4 flex flex-col gap-2">
                {activeBlocks.map((entry, index) => {
                  const label = tCatalog.has(`${entry.blockKey}.label`)
                    ? tCatalog(`${entry.blockKey}.label`)
                    : entry.label;
                  const description = tCatalog.has(`${entry.blockKey}.description`)
                    ? tCatalog(`${entry.blockKey}.description`)
                    : entry.description;
                  return (
                    <li key={entry.blockKey} className="flex flex-col items-center gap-2">
                      <div className="flex w-full items-start gap-3 rounded-[var(--radius-control)] border border-border bg-card p-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-text" aria-hidden="true">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold">{label}</p>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                              {tFamily(entry.family)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                          <p className="mt-2 text-[11px] font-bold text-accent-text">
                            {t("stepCount", { count: entry.steps.length })}
                          </p>
                        </div>
                      </div>
                      {index < activeBlocks.length - 1 && <ArrowDown className="size-4 text-muted-foreground" aria-hidden="true" />}
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-[0.08em] text-muted-foreground uppercase">{t("sourcePreviewTitle")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("sourcePreviewHelp")}</p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {value.sources.length > 0 ? value.sources.map((source) => (
                    <span key={source} className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                      {tSource(source as FunnelSourceKey)}
                    </span>
                  )) : (
                    <span className="text-xs text-muted-foreground">{t("noSources")}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-bold">{t("platforms")}</p>
          <div className="flex flex-wrap gap-2">
            {PLATFORM_NAMES.map((platformOption) => {
              const active = value.platforms.some((platform) => platform.name === platformOption.value);
              return (
                <button
                  key={platformOption.value}
                  type="button"
                  onClick={() => togglePlatform(platformOption.value, !active)}
                  className={
                    active
                      ? "rounded-full border border-positive bg-positive-soft px-3 py-1.5 text-sm font-bold text-positive"
                      : "rounded-full border border-border bg-background px-3 py-1.5 text-sm font-bold text-muted-foreground hover:border-positive/50"
                  }
                >
                  {platformOption.labelKey ? t(platformOption.labelKey) : platformOption.value}
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
                      <span className="font-bold text-muted-foreground">{platform.name} — {t("link")}</span>
                      <input
                        type="text"
                        value={platform.url}
                        onChange={(event) => updatePlatform(platform.name, { url: event.target.value })}
                        placeholder="https://..."
                        className={inputClass}
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-bold text-muted-foreground">{t("postsPerWeek")}</span>
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
          title={t("leadMagnet")}
          enabled={value.leadMagnet.enabled}
          onEnabledChange={(enabled) => update({ leadMagnet: { ...value.leadMagnet, enabled } })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("type")}</span>
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
                <option value="">{t("choose")}</option>
                {LEAD_MAGNET_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("titleLabel")}</span>
              <input
                type="text"
                value={value.leadMagnet.title}
                onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, title: event.target.value } })}
                className={inputClass}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("promise")}</span>
            <input
              type="text"
              value={value.leadMagnet.promise}
              onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, promise: event.target.value } })}
              placeholder={t("promisePlaceholder")}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("linkLabel")}</span>
            <input
              type="text"
              value={value.leadMagnet.url}
              onChange={(event) => update({ leadMagnet: { ...value.leadMagnet, url: event.target.value } })}
              className={inputClass}
            />
          </label>
        </ConditionalBlock>

        <ConditionalBlock
          title={t("vsl")}
          enabled={value.vsl.enabled}
          onEnabledChange={(enabled) => update({ vsl: { ...value.vsl, enabled } })}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-bold">{t("linkLabel")}</span>
            <input
              type="text"
              value={value.vsl.url}
              onChange={(event) => update({ vsl: { ...value.vsl, url: event.target.value } })}
              className={inputClass}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("duration")}</span>
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
              <span className="font-bold">{t("mainCta")}</span>
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
          title={t("setting")}
          enabled={value.setting.enabled}
          onEnabledChange={(enabled) => update({ setting: { ...value.setting, enabled } })}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("channel")}</span>
              <input
                type="text"
                value={value.setting.channel}
                onChange={(event) => update({ setting: { ...value.setting, channel: event.target.value } })}
                placeholder={t("channelPlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-bold">{t("whoSets")}</span>
              <input
                type="text"
                value={value.setting.operator}
                onChange={(event) => update({ setting: { ...value.setting, operator: event.target.value } })}
                placeholder={t("whoSetsPlaceholder")}
                className={inputClass}
              />
            </label>
          </div>
        </ConditionalBlock>
      </div>

      <Dialog open={funnelEditorOpen} onOpenChange={setFunnelEditorOpen}>
        <DialogContent className="max-h-[calc(100vh-1rem)] max-w-5xl p-6 sm:p-8">
          <DialogTitle className="text-lg font-bold">{t("funnelEditorTitle")}</DialogTitle>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("funnelImpact")}</p>
          <div className="mt-5">
            <FunnelBlockBuilder
              catalog={blockCatalog}
              initialBlocks={value.blocks}
              initialSources={value.sources}
              onSave={saveBlocks}
              onCancel={() => setFunnelEditorOpen(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
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
  const t = useTranslations("business.acquisition");
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
                ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
                : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
            }
          >
            {t("yes")}
          </button>
          <button
            type="button"
            onClick={() => onEnabledChange("no")}
            className={
              enabled === "no"
                ? "rounded-full border border-positive bg-positive-soft px-3 py-1 text-xs font-bold text-positive"
                : "rounded-full border border-border px-3 py-1 text-xs font-bold text-muted-foreground"
            }
          >
            {t("no")}
          </button>
        </div>
      </div>
      {enabled === "yes" && <div className="mt-4 flex flex-col gap-3">{children}</div>}
    </div>
  );
}
