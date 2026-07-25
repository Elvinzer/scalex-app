"use client";

import { useEffect, useState } from "react";

import { AgentPanel, type CopilotePanelItem } from "@/components/copilote/agent-panel";
import { CopiloteChatPanel } from "@/components/copilote/copilote-chat-panel";
import { Falco } from "@/components/falco/falco";
import { recordCopiloteAgentSelected, recordCopiloteSwitchFromRedirect } from "@/lib/agent/copilote-tracking";
import { AGENT_KEY_TO_SKIN, AGENT_KEY_TO_SPECIALTY } from "@/lib/falco-skins";

const STORAGE_KEY = "copilote:lastAgent";
// Consolidated to 4 agents (was 7 — see lib/agent/lever-agent-data.ts and
// app/api/improve-chat/route.ts's AGENT_KEY_CONSOLIDATION): Mail, Contenu
// unchanged; Ventes absorbs Closing+Produits+Upsell; CEO Vision absorbs
// Setting+Ads.
const DISPLAY_ORDER = ["email_marketing", "content", "ventes", "ceo_vision"];

type AgentSummary = { agentKey: string; leverKey: string | null; name: string; falcoSkinIcon: string };
type AgentDataSummary = { gapBadge: string | null; impactAmountEur: number | null } | null;
type LastMessage = { content: string; createdAt: string };

function truncate(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 60 ? `${singleLine.slice(0, 60)}…` : singleLine;
}

export function CopilotePageClient({
  agents,
  agentData,
  leverStatusByKey,
  lastMessages,
  initialAgentKey,
}: {
  agents: AgentSummary[];
  agentData: Record<string, AgentDataSummary>;
  leverStatusByKey: Record<string, string>;
  lastMessages: Record<string, LastMessage>;
  initialAgentKey: string | null;
}) {
  const [selectedAgentKey, setSelectedAgentKey] = useState<string | null>(initialAgentKey);

  // Deep link wins over the persisted selection (and re-persists itself, so
  // a plain future `/copilote` visit remembers it too); otherwise fall back
  // to whatever was last consulted on this device.
  useEffect(() => {
    if (initialAgentKey) {
      window.localStorage.setItem(STORAGE_KEY, initialAgentKey);
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setSelectedAgentKey(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byKey = new Map(agents.map((agent) => [agent.agentKey, agent]));
  const orderedAgents = DISPLAY_ORDER.map((key) => byKey.get(key)).filter((agent): agent is AgentSummary => agent !== undefined);
  const agentNameToKey = Object.fromEntries(agents.map((agent) => [agent.name, agent.agentKey]));

  function selectAgent(agentKey: string) {
    setSelectedAgentKey(agentKey);
    window.localStorage.setItem(STORAGE_KEY, agentKey);
    void recordCopiloteAgentSelected(agentKey, Boolean(lastMessages[agentKey]));
  }

  function handleRedirect(toAgentKey: string) {
    if (selectedAgentKey) void recordCopiloteSwitchFromRedirect(selectedAgentKey, toAgentKey);
    selectAgent(toAgentKey);
  }

  function statusFor(agent: AgentSummary): string {
    return agent.leverKey ? (leverStatusByKey[agent.leverKey] ?? "not_answered") : "active";
  }

  const items: CopilotePanelItem[] = [
    {
      agentKey: "general",
      name: "Copilote",
      specialty: null,
      skin: null,
      isActive: true,
      isAbsent: false,
      hasGap: false,
      preview: lastMessages.general ? truncate(lastMessages.general.content) : null,
    },
    ...orderedAgents.map((agent): CopilotePanelItem => {
      const status = statusFor(agent);
      const isAbsent = status === "absent";
      const hasMessages = Boolean(lastMessages[agent.agentKey]);
      return {
        agentKey: agent.agentKey,
        name: agent.name,
        specialty: AGENT_KEY_TO_SPECIALTY[agent.agentKey] ?? null,
        skin: AGENT_KEY_TO_SKIN[agent.agentKey] ?? null,
        isActive: !agent.leverKey || status === "active",
        isAbsent,
        hasGap: !hasMessages && isAbsent,
        preview: hasMessages ? truncate(lastMessages[agent.agentKey].content) : null,
      };
    }),
  ];

  const selectedItem = items.find((item) => item.agentKey === selectedAgentKey) ?? null;
  const selectedAgentData = selectedAgentKey ? (agentData[selectedAgentKey] ?? null) : null;

  const selectedAgent = selectedAgentKey ? byKey.get(selectedAgentKey) : undefined;
  const selectedMode: "optimiser" | "demarrer" | "decouverte" | null =
    !selectedAgent || selectedAgentKey === "general"
      ? null
      : !selectedAgent.leverKey
        ? "optimiser"
        : statusFor(selectedAgent) === "active"
          ? "optimiser"
          : statusFor(selectedAgent) === "not_answered"
            ? "decouverte"
            : "demarrer";

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row lg:gap-0">
      <div className="lg:hidden">
        <AgentPanel items={items} selectedAgentKey={selectedAgentKey} onSelect={selectAgent} compact />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border lg:rounded-r-none">
        {selectedItem ? (
          <CopiloteChatPanel
            agentKey={selectedItem.agentKey}
            name={selectedItem.name}
            skin={selectedItem.skin}
            gapBadge={selectedAgentData?.gapBadge ?? null}
            mode={selectedMode}
            agentNameToKey={agentNameToKey}
            onSelectAgent={handleRedirect}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <Falco pose="neutral" size="md" />
            <p className="max-w-sm text-sm text-muted-foreground">Choisis ton expert à droite. Chacun connaît déjà tes chiffres.</p>
          </div>
        )}
      </div>

      <div className="hidden w-[280px] shrink-0 lg:block">
        <AgentPanel items={items} selectedAgentKey={selectedAgentKey} onSelect={selectAgent} />
      </div>
    </div>
  );
}
