import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { agentsRegistry } from "@/db/schema";

export type AgentRegistryRow = {
  agentKey: string;
  leverKey: string | null;
  name: string;
  falcoSkinIcon: string;
  falcoSkinAssetKey: string | null;
  systemPromptTemplate: string;
  temperature: number;
};

// Direct DB read, no cache — same convention as getLeversCatalog(). Returns
// null (never a generic placeholder row) when agentKey doesn't match an
// active row: the caller (app/api/improve-chat/route.ts) must reject the
// request rather than silently falling back to a generic prompt.
export async function getAgentByKey(agentKey: string): Promise<AgentRegistryRow | null> {
  const [row] = await db
    .select()
    .from(agentsRegistry)
    .where(and(eq(agentsRegistry.agentKey, agentKey), eq(agentsRegistry.isActive, true)))
    .limit(1);

  if (!row) return null;

  return {
    agentKey: row.agentKey,
    leverKey: row.leverKey,
    name: row.name,
    falcoSkinIcon: row.falcoSkinIcon,
    falcoSkinAssetKey: row.falcoSkinAssetKey,
    systemPromptTemplate: row.systemPromptTemplate,
    temperature: row.temperature,
  };
}
