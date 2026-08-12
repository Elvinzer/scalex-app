"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  CreditCard,
  Gift,
  GripVertical,
  HandCoins,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Plus,
  Presentation,
  Save,
  ShoppingCart,
  Swords,
  Target,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FunnelBlockCatalogEntry, FunnelBlockSelectionItem, FunnelSourceKey } from "@/lib/funnel-blocks/types";

export type FunnelBlockBuilderPayload = {
  blocks: FunnelBlockSelectionItem[];
  sources: FunnelSourceKey[];
};

type BuilderResult = { error: string | null };

const BLOCK_ICONS: Record<string, LucideIcon> = {
  vsl: Video,
  lead_magnet: Gift,
  quiz: CircleHelp,
  page_de_vente: ShoppingCart,
  inscription_event: CalendarDays,
  aucune_capture: MessageCircle,
  communaute_freemium: Users,
  sequence_email: Mail,
  challenge: Swords,
  webinaire: Presentation,
  setting_dm: MessageSquare,
  appel: Phone,
  checkout_direct: CreditCard,
  offre_fin_event: Target,
};

function blockIcon(blockKey: string): LucideIcon {
  return BLOCK_ICONS[blockKey] ?? HandCoins;
}

export function FunnelBlockBuilder({
  catalog,
  initialBlocks,
  initialSources,
  simplified = false,
  showSources = true,
  onSave,
  onCancel,
}: {
  catalog: FunnelBlockCatalogEntry[];
  initialBlocks: FunnelBlockSelectionItem[];
  initialSources: FunnelSourceKey[];
  simplified?: boolean;
  showSources?: boolean;
  onSave: (payload: FunnelBlockBuilderPayload) => Promise<BuilderResult>;
  onCancel?: () => void;
}) {
  const t = useTranslations("funnelBlocks.builder");
  const tCatalog = useTranslations("funnelBlocks.catalog");
  const tMetric = useTranslations("funnelBlocks.metrics");
  const [blocks, setBlocks] = useState<FunnelBlockSelectionItem[]>(() => normalizeBlocks(initialBlocks, catalog));
  const [sources, setSources] = useState<FunnelSourceKey[]>(initialSources);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const byKey = useMemo(() => new Map(catalog.map((entry) => [entry.blockKey, entry])), [catalog]);
  const selectedKeys = useMemo(() => new Set(blocks.map((item) => item.blockKey)), [blocks]);
  const labelFor = (entry: FunnelBlockCatalogEntry) =>
    tCatalog.has(`${entry.blockKey}.label`) ? tCatalog(`${entry.blockKey}.label`) : entry.label;
  const stepLabelFor = (metricKey: string, fallback: string) =>
    tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const familyEntries = useMemo(
    () => ({
      capture: catalog.filter((entry) => entry.family === "capture"),
      // "No nurturing" is represented by an empty optional zone in the
      // package. Keep the legacy catalogue row available to old deep links,
      // but do not expose it as a contradictory selectable step here.
      nurturing: catalog.filter((entry) => entry.family === "nurturing" && entry.blockKey !== "aucune_nurturing"),
      conversion: catalog.filter((entry) => entry.family === "conversion"),
      source: catalog.filter((entry) => entry.family === "source"),
    }),
    [catalog]
  );

  function selectBlock(entry: FunnelBlockCatalogEntry) {
    setSaved(false);
    setError(null);
    setBlocks((current) => {
      const selected = current.some((item) => item.blockKey === entry.blockKey);
      const currentFamily = current.filter((item) => byKey.get(item.blockKey)?.family === entry.family);

      if (entry.family === "nurturing") {
        if (selected) return normalizeBlocks(current.filter((item) => item.blockKey !== entry.blockKey), catalog);
        if (currentFamily.length >= 2) return current;
        return normalizeBlocks([...current, { blockKey: entry.blockKey, order: current.length + 1 }], catalog);
      }

      // Capture and conversion are multi-select in the handoff. The last
      // remaining block in either mandatory zone cannot be removed.
      if (selected) {
        if (currentFamily.length <= 1) return current;
        return normalizeBlocks(current.filter((item) => item.blockKey !== entry.blockKey), catalog);
      }

      return normalizeBlocks([...current, { blockKey: entry.blockKey, order: current.length + 1 }], catalog);
    });
  }

  function toggleSource(source: FunnelSourceKey) {
    setSaved(false);
    setError(null);
    setSources((current) =>
      current.includes(source)
        ? current.length === 1
          ? current
          : current.filter((item) => item !== source)
        : [...current, source]
    );
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
      return normalizeBlocks(
        [...current.filter((candidate) => byKey.get(candidate.blockKey)?.family !== "nurturing"), ...next],
        catalog
      );
    });
  }

  function dropNurturing(targetKey: string) {
    if (!dragged || dragged === targetKey) return;
    const nurturing = blocks.filter((item) => byKey.get(item.blockKey)?.family === "nurturing");
    const sourceIndex = nurturing.findIndex((item) => item.blockKey === dragged);
    const targetIndex = nurturing.findIndex((item) => item.blockKey === targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...nurturing];
    const [item] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, item);
    setBlocks(
      normalizeBlocks(
        [...blocks.filter((candidate) => byKey.get(candidate.blockKey)?.family !== "nurturing"), ...next],
        catalog
      )
    );
    setDragged(null);
  }

  async function submit() {
    setError(null);
    setIsPending(true);
    const result = await onSave({ blocks: normalizeBlocks(blocks, catalog), sources });
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
    <div className="flex flex-col gap-6" data-testid="funnel-block-builder" data-builder-mode={simplified ? "onboarding" : "modal"}>
      <div className="flex flex-col gap-7">
        <BuilderZone
          title={t("capture")}
          help={t("captureHelp")}
          entries={familyEntries.capture}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          labelFor={labelFor}
        />
        <NurturingZone
          title={t("nurturing")}
          help={t("nurturingHelp")}
          entries={familyEntries.nurturing}
          blocks={blocks}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          onMove={moveNurturing}
          onDragStart={setDragged}
          onDrop={dropNurturing}
          labelFor={labelFor}
        />
        <BuilderZone
          title={t("conversion")}
          help={t("conversionHelp")}
          entries={familyEntries.conversion}
          selectedKeys={selectedKeys}
          onSelect={selectBlock}
          labelFor={labelFor}
        />
      </div>

      <div className="rounded-[var(--radius-card)] bg-surface-dark px-5 py-5 text-text-on-dark" aria-labelledby="funnel-preview-title">
        <p className="text-xs font-bold tracking-[0.08em] text-text-on-dark-muted uppercase">{t("previewEyebrow")}</p>
        <h3 id="funnel-preview-title" className="sr-only">{t("previewTitle")}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2" aria-label={t("previewTitle")}>
          {sequence.map((entry, index) => {
            const Icon = blockIcon(entry.blockKey);
            return (
              <div key={entry.blockKey} className="flex items-center gap-2">
                {index > 0 && <ArrowRight className="size-3.5 text-text-on-dark-muted" aria-hidden="true" />}
                <span className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-mist/10 px-3 py-2 text-[13.5px] font-bold">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {labelFor(entry)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-text-on-dark-muted">{t("previewHint")}</p>
        <div className="mt-3 flex flex-wrap gap-2" aria-label={t("previewMetrics")}>
          {sequence.flatMap((entry) => entry.steps).map((step) => (
            <span key={`${step.metricKey}-${step.order}`} className="rounded-full bg-mist/10 px-2.5 py-1 text-[11px] font-medium text-text-on-dark-muted">
              {stepLabelFor(step.metricKey, step.label)}
            </span>
          ))}
        </div>
      </div>

      {showSources && (
        <div className="rounded-[var(--radius-card)] border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-bold">{t("sourcesTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("sourcesHelp")}</p>
            </div>
            <span className="text-xs font-bold text-muted-foreground">{sources.length} / {familyEntries.source.length}</span>
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
                  className={selected
                    ? "min-h-11 cursor-pointer rounded-full border-2 border-accent bg-accent-soft px-4 py-2 text-sm font-bold text-accent-text transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-accent-2"
                    : "min-h-11 cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-sm font-bold text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:border-accent/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent-2"}
                >
                  {selected && <Check className="mr-1.5 inline size-3.5" aria-hidden="true" />}
                  {labelFor(entry)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-[var(--radius-control)] border border-accent-border bg-accent-soft/50 px-4 py-3 text-sm leading-6 text-accent-text">
        <p className="font-bold">{t("warningTitle")}</p>
        <p className="mt-1">{t("warningBody")}</p>
      </div>

      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && <span className="text-sm font-bold text-state-healthy">{t("saved")}</span>}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            <X aria-hidden="true" />
            {t("cancel")}
          </Button>
        )}
        <Button type="button" variant={simplified ? "default" : "default"} onClick={() => void submit()} disabled={isPending || sources.length === 0}>
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
  labelFor,
}: {
  title: string;
  help: string;
  entries: FunnelBlockCatalogEntry[];
  selectedKeys: Set<string>;
  onSelect: (entry: FunnelBlockCatalogEntry) => void;
  labelFor: (entry: FunnelBlockCatalogEntry) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${title}-zone-title`}>
      <div>
        <h3 id={`${title}-zone-title`} className="text-[13px] font-bold">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {entries.map((entry) => {
          const selected = selectedKeys.has(entry.blockKey);
          const Icon = blockIcon(entry.blockKey);
          return (
            <button
              key={entry.blockKey}
              type="button"
              title={entry.description}
              aria-pressed={selected}
              onClick={() => onSelect(entry)}
              className={selected
                ? "min-h-[104px] cursor-pointer rounded-[var(--radius-control)] border-2 border-accent bg-accent-soft p-3 text-left transition-colors duration-[var(--motion-fast)] focus-visible:outline-2 focus-visible:outline-accent-2"
                : "min-h-[104px] cursor-pointer rounded-[var(--radius-control)] border border-border bg-card p-3 text-left transition-colors duration-[var(--motion-fast)] hover:border-accent/60 hover:bg-accent-soft/30 focus-visible:outline-2 focus-visible:outline-accent-2"}
            >
              <span className={selected ? "flex size-8 items-center justify-center rounded-lg bg-card text-accent-text" : "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-[13px] leading-5 font-bold text-foreground">{labelFor(entry)}</span>
              {selected && <Check className="mt-1 size-3.5 text-accent-text" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function NurturingZone({
  title,
  help,
  entries,
  blocks,
  selectedKeys,
  onSelect,
  onMove,
  onDragStart,
  onDrop,
  labelFor,
}: {
  title: string;
  help: string;
  entries: FunnelBlockCatalogEntry[];
  blocks: FunnelBlockSelectionItem[];
  selectedKeys: Set<string>;
  onSelect: (entry: FunnelBlockCatalogEntry) => void;
  onMove: (blockKey: string, delta: -1 | 1) => void;
  onDragStart: (blockKey: string) => void;
  onDrop: (blockKey: string) => void;
  labelFor: (entry: FunnelBlockCatalogEntry) => string;
}) {
  const t = useTranslations("funnelBlocks.builder");
  const byKey = useMemo(() => new Map(entries.map((entry) => [entry.blockKey, entry])), [entries]);
  const selectedEntries = blocks
    .filter((item) => byKey.has(item.blockKey))
    .sort((a, b) => a.order - b.order)
    .map((item) => byKey.get(item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined);
  const availableEntries = entries.filter((entry) => !selectedKeys.has(entry.blockKey));

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${title}-zone-title`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${title}-zone-title`} className="text-[13px] font-bold">{title}</h3>
          <span className="text-[11px] font-bold text-muted-foreground">{selectedEntries.length}/2</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p>
      </div>

      <div className="flex flex-col gap-2" aria-label={t("selectedNurturing")}>
        {selectedEntries.map((entry, index) => {
          const Icon = blockIcon(entry.blockKey);
          return (
            <div
              key={entry.blockKey}
              draggable
              onDragStart={() => onDragStart(entry.blockKey)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(entry.blockKey)}
              className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2"
            >
              <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" aria-label={t("dragToReorder")} />
              <Icon className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-bold">{labelFor(entry)}</span>
              <div className="flex items-center gap-1">
                <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={() => onMove(entry.blockKey, -1)} disabled={index === 0} aria-label={t("moveUp")}>
                  <ArrowUp className="size-3.5" aria-hidden="true" />
                </button>
                <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40" onClick={() => onMove(entry.blockKey, 1)} disabled={index === selectedEntries.length - 1} aria-label={t("moveDown")}>
                  <ArrowDown className="size-3.5" aria-hidden="true" />
                </button>
                <Button type="button" variant="ghost" size="sm" className="min-h-9 px-2 text-xs text-muted-foreground" onClick={() => onSelect(entry)}>
                  {t("remove")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {availableEntries.map((entry) => (
          <button
            key={entry.blockKey}
            type="button"
            onClick={() => onSelect(entry)}
            disabled={selectedEntries.length >= 2}
            className="min-h-[52px] cursor-pointer rounded-[var(--radius-control)] border border-dashed border-border bg-card px-3 py-2 text-left text-[13px] font-bold text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:border-accent/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus className="mr-1.5 inline size-3.5" aria-hidden="true" />
            {labelFor(entry)}
          </button>
        ))}
      </div>
    </section>
  );
}

function normalizeBlocks(blocks: FunnelBlockSelectionItem[], catalog: FunnelBlockCatalogEntry[]): FunnelBlockSelectionItem[] {
  const byKey = new Map(catalog.map((entry) => [entry.blockKey, entry]));
  const unique = blocks.filter(
    (item, index, values) => values.findIndex((candidate) => candidate.blockKey === item.blockKey) === index
  );
  const familyRank: Record<string, number> = { capture: 1, nurturing: 2, conversion: 3 };
  return unique
    .slice()
    .sort((a, b) => {
      const rankDelta = (familyRank[byKey.get(a.blockKey)?.family ?? ""] ?? 9) - (familyRank[byKey.get(b.blockKey)?.family ?? ""] ?? 9);
      return rankDelta || a.order - b.order;
    })
    .map((item, index) => ({ blockKey: item.blockKey, order: index + 1 }));
}
