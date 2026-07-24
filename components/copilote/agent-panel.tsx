"use client";

import Link from "next/link";

import { Falco } from "@/components/falco/falco";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import { cn } from "@/lib/utils";

export type CopilotePanelItem = {
  agentKey: string; // "general" for the generalist, real agent_key otherwise
  name: string;
  specialty: string | null; // null for the generalist
  skin: FalcoSkinKey | null; // null → base Falco bust
  isActive: boolean; // generalist + non-lever agents + "active" levers
  isAbsent: boolean; // "À lancer" badge — only real levers with status "absent"
  hasGap: boolean; // unread-insight pastille
  preview: string | null; // last message, already truncated by the caller
};

// Dumb/reusable — ordering, grouping, and the pastille/preview logic are all
// computed by app/(app)/copilote/copilote-page-client.tsx from data it
// already has; this component only renders the list. `compact` renders the
// same items as a horizontal scroller of portraits (< 1024px), not a
// separate component.
export function AgentPanel({
  items,
  selectedAgentKey,
  onSelect,
  compact = false,
}: {
  items: CopilotePanelItem[];
  selectedAgentKey: string | null;
  onSelect: (agentKey: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <button
            key={item.agentKey}
            type="button"
            onClick={() => onSelect(item.agentKey)}
            className="relative flex shrink-0 flex-col items-center gap-1"
          >
            <span
              className={cn(
                "relative flex size-12 items-center justify-center rounded-full",
                selectedAgentKey === item.agentKey && "ring-2 ring-accent"
              )}
            >
              {item.skin ? (
                <Falco skin={item.skin} portrait skinSizePx={40} className="rounded-full" />
              ) : (
                <Falco pose="neutral" size="sm" />
              )}
              {item.hasGap && <span className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-surface bg-accent" />}
            </span>
            <span className="max-w-16 truncate text-xs font-bold">{item.name}</span>
          </button>
        ))}
      </div>
    );
  }

  const activeItems = items.filter((item) => item.isActive);
  const inactiveItems = items.filter((item) => !item.isActive);

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-1">
          {activeItems.map((item) => (
            <PanelRow key={item.agentKey} item={item} selected={item.agentKey === selectedAgentKey} onSelect={onSelect} />
          ))}
        </div>

        {inactiveItems.length > 0 && (
          <>
            <p className="mt-4 mb-1 px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">Pas encore lancé</p>
            <div className="flex flex-col gap-1">
              {inactiveItems.map((item) => (
                <PanelRow key={item.agentKey} item={item} selected={item.agentKey === selectedAgentKey} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Link href="/diagnostic?tab=discovery" className="btn-ghost text-sm">
          Gérer mes leviers →
        </Link>
      </div>
    </div>
  );
}

function PanelRow({
  item,
  selected,
  onSelect,
}: {
  item: CopilotePanelItem;
  selected: boolean;
  onSelect: (agentKey: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.agentKey)}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-control)] p-2 text-left",
        selected ? "rounded-l-none border-l-2 border-accent bg-surface-sunken" : "hover:bg-muted"
      )}
    >
      <span className="relative flex shrink-0">
        {item.skin ? (
          <Falco skin={item.skin} portrait skinSizePx={40} className="rounded-full" />
        ) : (
          <Falco pose="neutral" size="sm" />
        )}
        {item.hasGap && <span className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-surface bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold">{item.name}</span>
          {item.isAbsent && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">À lancer</span>
          )}
        </span>
        {item.specialty && <span className="block text-xs text-muted-foreground">{item.specialty}</span>}
        <span className="block truncate text-xs text-muted-foreground">{item.preview ?? "Nouvelle conversation"}</span>
      </span>
    </button>
  );
}
