import { randomUUID } from "node:crypto";

import { z } from "zod";

import { db } from "@/db";
import { agentTokenUsage } from "@/db/schema";

const usageSchema = z.object({
  businessId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  keySource: z.enum(["byok", "shared"]),
  operation: z.string().min(1).max(100),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

export type AgentUsageInput = z.infer<typeof usageSchema>;

// A stable ID makes a retry safe if the first insert committed before the
// database connection failed. Keys, prompts and responses never enter this row.
export async function recordAgentUsage(input: AgentUsageInput): Promise<void> {
  const values = { id: randomUUID(), ...usageSchema.parse(input) };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await db.insert(agentTokenUsage).values(values).onConflictDoNothing({ target: agentTokenUsage.id });
      return;
    } catch {
      if (attempt === 1) {
        console.error("[agent] token usage persistence failed", { businessId: values.businessId, operation: values.operation });
      }
    }
  }
}
