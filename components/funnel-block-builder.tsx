"use client";

import { ArrowDown, ArrowUp, Check, GripVertical, Loader2, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FunnelBlockCatalogEntry, FunnelBlockSelectionItem, FunnelSourceKey } from "@/lib/funnel-blocks/types";

export type FunnelBlockBuilderPayload = {
  blocks: FunnelBlockSelectionItem[];
  sources: FunnelSourceKey[];
};

type BuilderResult = { error: string | null };

export function FunnelBlockBuilder({
  catalog,
  initialBlocks,
  initialSources,
  simplified = false,
  showSources = true,
  onSave,
}: {
  catalog: FunnelBlockCatalogEntry[];
  initialBlocks: FunnelBlockSelectionItem[];
  initialSources: FunnelSourceKey[];
  simplified?: boolean;
  showSources?: boolean;
  onSave: (payload: FunnelBlockBuilderPayload) => Promise<BuilderResult>;
}) {
  const t = useTranslations("funnelBlocks.builder");
  const tCatalog = useTranslations("funnelBlocks.catalog");
  const tMetric = useTranslations("funnelBlocks.metrics");
  const [blocks, setBlocks] = useState<FunnelBlockSelectionItem[]>(() => normalizeBlocks(initialBlocks));
  const [sources, setSources] = useState<FunnelSourceKey[]>(initialSources);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const byKey = useMemo(() => new Map(catalog.map((entry) => [entry.blockKey, entry])), [catalog]);
  const selectedKeys = useMemo(() => new Set(blocks.map((item) => item.blockKey)), [blocks]);
  const labelFor = (entry: FunnelBlockCatalogEntry) => tCatalog.has(`${entry.blockKey}.label`) ? tCatalog(`${entry.blockKey}.label`) : entry.label;
  const descriptionFor = (entry: FunnelBlockCatalogEntry) => tCatalog.has(`${entry.blockKey}.description`) ? tCatalog(`${entry.blockKey}.description`) : entry.description;
  const stepLabelFor = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const familyEntries = useMemo(
    () => ({
      capture: catalog.filter((entry) => entry.family === "capture"),
      nurturing: catalog.filter((entry) => entry.family === "nurturing"),
      conversion: catalog.filter((entry) => entry.family === "conversion"),
      source: catalog.filter((entry) => entry.family === "source"),
    }),
    [catalog]
  );

  function selectBlock(entry: FunnelBlockCatalogEntry) {
    setSaved(false);
    setError(null);
    setBlocks((current) => {
      const withoutFamily = current.filter((item) => byKey.get(item.blockKey)?.family !== entry.family);
      if (entry.family === "nurturing") {
        const currentNurturing = current.filter((item) => byKey.get(item.blockKey)?.family === "nurturing");
        if (currentNurturing.some((item) => item.blockKey === entry.blockKey)) {
          return normalizeBlocks(current.filter((item) => item.blockKey !== entry.blockKey));
        }
        const nextNurturing = [...currentNurturing, { blockKey: entry.blockKey, order: 2 }].slice(0, 2);
        return normalizeBlocks([
          ...current.filter((item) => byKey.get(item.blockKey)?.family !== "nurturing"),
          ...nextNurturing,
        ]);
      }
      return normalizeBlocks([...withoutFamily, { blockKey: entry.blockKey, order: entry.family === "capture" ? 1 : 3 }]);
    });
  }

  function toggleSource(source: FunnelSourceKey) {
    setSaved(false);
    setError(null);
    setSources((current) => current.includes(source) ? (current.length === 1 ? current : current.filter((item) => item !== source)) : [...current, source]);
  }

  function moveNurturing(blockKey: string, delta: -1 | 1) {
    setSaved(false);
    setBlocks((current) => {
      const nurturing = current.filter((item) => byKey.get(item.blockKey)?.family === "nurturing");
      const index = nurturing.findIndex((item) => item.blockKey === blockKey);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= nurturing.length) return current;
      const next = [...nurturing];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return normalizeBlocks([
        ...current.filter((candidate) => byKey.get(candidate.blockKey)?.family !== "nurturing"),
        ...next,
      ]);
    });
  }

  function dropNurturing(targetKey: string) {
    if (!dragged || dragged === targetKey) return;
    const source = blocks.find((item) => item.blockKey === dragged);
    const target = blocks.find((item) => item.blockKey === targetKey);
    if (!source || !target) return;
    const nurturing = blocks.filter((item) => byKey.get(item.blockKey)?.family === "nurturing");
    const sourceIndex = nurturing.findIndex((item) => item.blockKey === dragged);
    const targetIndex = nurturing.findIndex((item) => item.blockKey === targetKey);
    const next = [...nurturing];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    setBlocks(normalizeBlocks([
      ...blocks.filter((candidate) => byKey.get(candidate.blockKey)?.family !== "nurturing"),
      ...next,
    ]));
    setDragged(null);
  }

  async function submit() {
    setError(null);
    setIsPending(true);
    const result = await onSave({ blocks: normalizeBlocks(blocks), sources });
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  const sequence = blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => byKey.get(item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined);

  return (
    <div className="flex flex-col gap-5" data-testid="funnel-block-builder">
      <div className="grid gap-4 lg:grid-cols-3">
        <BuilderZone
          title={t("capture")}
          help={t("captureHelp")}
          entries={familyEntries.capture}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          labelFor={labelFor}
          descriptionFor={descriptionFor}
        />
        <BuilderZone
          title={t("nurturing")}
          help={t("nurturingHelp")}
          entries={familyEntries.nurturing}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          multi
          onMove={moveNurturing}
          onDragStart={setDragged}
          onDrop={dropNurturing}
          labelFor={labelFor}
          descriptionFor={descriptionFor}
        />
        <BuilderZone
          title={t("conversion")}
          help={t("conversionHelp")}
          entries={familyEntries.conversion}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          labelFor={labelFor}
          descriptionFor={descriptionFor}
        />
      </div>

      <div className="sticker-card bg-surface-sunken p-4" aria-labelledby="funnel-preview-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("previewEyebrow")}</p>
            <h3 id="funnel-preview-title" className="mt-1 text-base font-bold">{t("previewTitle")}</h3>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{t("previewHint")}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={t("previewTitle")}>
          {sequence.map((entry, index) => (
            <div key={entry.blockKey} className="flex items-center gap-2">
              {index > 0 && <span className="text-muted-foreground" aria-hidden="true">→</span>}
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold">{labelFor(entry)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sequence.flatMap((entry) => entry.steps).map((step) => (
            <span key={`${step.metricKey}-${step.order}`} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {stepLabelFor(step.metricKey, step.label)}
            </span>
          ))}
        </div>
      </div>

      {showSources && <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-bold">{t("sourcesTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("sourcesHelp")}</p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">{sources.length} / {familyEntries.source.length}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {familyEntries.source.map((entry) => {
            const source = entry.blockKey as FunnelSourceKey;
            const selected = sources.includes(source);
            return (
              <button
                key={entry.blockKey}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleSource(source)}
                className={selected ? "min-h-11 rounded-full border-2 border-accent bg-accent-soft px-4 py-2 text-sm font-bold text-accent-text" : "min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:border-accent/50"}
              >
                {selected && <Check className="mr-1.5 inline size-3.5" aria-hidden="true" />}
                {labelFor(entry)}
              </button>
            );
          })}
        </div>
      </div>}

      <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/40 p-4 text-sm leading-6 text-muted-foreground">
        <p className="font-bold text-foreground">{t("warningTitle")}</p>
        <p className="mt-1">{t("warningBody")}</p>
      </div>

      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && <span className="text-sm font-bold text-state-healthy">{t("saved")}</span>}
        <Button type="button" variant={simplified ? "default" : "outline"} onClick={() => void submit()} disabled={isPending || sources.length === 0}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}

function BuilderZone({
  title,
  help,
  entries,
  selectedKeys,
  onSelect,
  multi = false,
  onMove,
  onDragStart,
  onDrop,
  labelFor,
  descriptionFor,
}: {
  title: string;
  help: string;
  entries: FunnelBlockCatalogEntry[];
  selectedKeys: Set<string>;
  onSelect: (entry: FunnelBlockCatalogEntry) => void;
  multi?: boolean;
  onMove?: (blockKey: string, delta: -1 | 1) => void;
  onDragStart?: (blockKey: string) => void;
  onDrop?: (blockKey: string) => void;
  labelFor: (entry: FunnelBlockCatalogEntry) => string;
  descriptionFor: (entry: FunnelBlockCatalogEntry) => string;
}) {
  const t = useTranslations("funnelBlocks.builder");

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${title}-zone-title`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${title}-zone-title`} className="text-base font-bold">{title}</h3>
          {multi && <span className="text-[11px] font-bold text-muted-foreground">0–2</span>}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>
      </div>
      <div className="grid gap-2">
        {entries.map((entry) => {
          const selected = selectedKeys.has(entry.blockKey);
          const isNurturing = entry.family === "nurturing";
          return (
            <div
              key={entry.blockKey}
              draggable={isNurturing && selected}
              onDragStart={() => isNurturing && onDragStart?.(entry.blockKey)}
              onDragOver={(event) => isNurturing && event.preventDefault()}
              onDrop={() => isNurturing && onDrop?.(entry.blockKey)}
              className={selected ? "rounded-[var(--radius-control)] border-2 border-accent bg-accent-soft p-3" : "rounded-[var(--radius-control)] border border-border bg-card p-3 transition-colors hover:border-border-hover"}
            >
              <button type="button" aria-pressed={selected} onClick={() => onSelect(entry)} className="flex min-h-11 w-full items-start gap-2 text-left">
                {isNurturing && selected && <GripVertical className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={t("dragToReorder")} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-bold">
                    {selected && <Check className="size-3.5 text-accent-text" aria-hidden="true" />}
                    {labelFor(entry)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{descriptionFor(entry)}</span>
                </span>
              </button>
              {isNurturing && selected && onMove && (
                <div className="mt-2 flex justify-end gap-1">
                  <button type="button" className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted" onClick={() => onMove(entry.blockKey, -1)} aria-label={t("moveUp")}><ArrowUp className="size-3.5" aria-hidden="true" /></button>
                  <button type="button" className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted" onClick={() => onMove(entry.blockKey, 1)} aria-label={t("moveDown")}><ArrowDown className="size-3.5" aria-hidden="true" /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function normalizeBlocks(blocks: FunnelBlockSelectionItem[]): FunnelBlockSelectionItem[] {
  return blocks.slice().sort((a, b) => a.order - b.order).map((item, index) => ({ blockKey: item.blockKey, order: index + 1 }));
}
