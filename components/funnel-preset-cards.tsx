"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import type { FunnelBlockSelectionItem } from "@/lib/funnel-blocks/types";

export type FunnelPresetKey = "leadMagnetCall" | "vslCall" | "settingCall" | "webinarCall" | "salesPageDirect" | "quizCall" | "different";

const PRESETS: Array<{ key: FunnelPresetKey; blocks: FunnelBlockSelectionItem[]; previewKey: string }> = [
  { key: "leadMagnetCall", blocks: [{ blockKey: "lead_magnet", order: 1 }, { blockKey: "appel", order: 2 }], previewKey: "previewLeadMagnet" },
  { key: "vslCall", blocks: [{ blockKey: "vsl", order: 1 }, { blockKey: "appel", order: 2 }], previewKey: "previewVsl" },
  { key: "settingCall", blocks: [{ blockKey: "aucune_capture", order: 1 }, { blockKey: "setting_dm", order: 2 }, { blockKey: "appel", order: 3 }], previewKey: "previewSetting" },
  { key: "webinarCall", blocks: [{ blockKey: "inscription_event", order: 1 }, { blockKey: "webinaire", order: 2 }, { blockKey: "appel", order: 3 }], previewKey: "previewWebinar" },
  { key: "salesPageDirect", blocks: [{ blockKey: "page_de_vente", order: 1 }, { blockKey: "checkout_direct", order: 2 }], previewKey: "previewSalesPage" },
  { key: "quizCall", blocks: [{ blockKey: "quiz", order: 1 }, { blockKey: "appel", order: 2 }], previewKey: "previewQuiz" },
];

export function FunnelPresetCards({
  selectedKey,
  onSelect,
}: {
  selectedKey: FunnelPresetKey | null;
  onSelect: (key: FunnelPresetKey, blocks: FunnelBlockSelectionItem[]) => void;
}) {
  const t = useTranslations("funnelBlocks.presets");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {PRESETS.map((preset) => {
        const selected = selectedKey === preset.key;
        return (
          <button
            key={preset.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(preset.key, preset.blocks)}
            className={selected
              ? "rounded-[var(--radius-control)] border-2 border-accent bg-accent-soft p-4 text-left"
              : "rounded-[var(--radius-control)] border border-border bg-card p-4 text-left transition-colors hover:border-accent/50"}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              {selected && <Check className="size-3.5 text-accent-text" aria-hidden="true" />}
              {t(preset.key)}
            </span>
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">{t(preset.previewKey)}</span>
            {selected && <span className="mt-2 block text-[11px] font-bold text-accent-text">{t("selected")}</span>}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={selectedKey === "different"}
        onClick={() => onSelect("different", [])}
        className={selectedKey === "different"
          ? "rounded-[var(--radius-control)] border-2 border-accent bg-accent-soft p-4 text-left sm:col-span-2"
          : "rounded-[var(--radius-control)] border border-dashed border-border bg-card p-4 text-left transition-colors hover:border-accent/50 sm:col-span-2"}
      >
        <span className="text-sm font-bold">{t("different")}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{t("differentHelp")}</span>
      </button>
    </div>
  );
}

export function funnelPresetBlocks(key: FunnelPresetKey): FunnelBlockSelectionItem[] {
  return PRESETS.find((preset) => preset.key === key)?.blocks ?? [];
}
