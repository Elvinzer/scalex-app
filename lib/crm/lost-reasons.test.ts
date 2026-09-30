import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { stageChangeSchema } from "@/lib/leads/schema";
import { LEAD_LOST_REASONS } from "@/lib/leads/types";

import { defaultStageAfterReopen } from "./machine";
import { crmLostReasonSchema, crmOutcomeSchema, crmStageSchema } from "./schemas";
import { CRM_LEAD_STAGES, CRM_LOST_REASONS } from "./types";

const migration = readFileSync(new URL("../../db/migrations/0066_wooden_hydra.sql", import.meta.url), "utf8");

describe("CRM lost reasons", () => {
  it("accepts the new value as a lost reason, not as a stage or outcome", () => {
    expect(CRM_LOST_REASONS).toContain("non_interesse");
    expect(LEAD_LOST_REASONS).toEqual(CRM_LOST_REASONS);
    expect(crmLostReasonSchema.safeParse("non_interesse").success).toBe(true);
    expect(crmStageSchema.safeParse("non_interesse").success).toBe(false);
    expect(crmOutcomeSchema.safeParse("non_interesse").success).toBe(false);
    expect(stageChangeSchema.safeParse({ toStage: "perdu", lostReason: "non_interesse" }).success).toBe(true);
    expect(stageChangeSchema.safeParse({ toStage: "non_interesse", lostReason: null }).success).toBe(false);
    expect(CRM_LEAD_STAGES).toHaveLength(5);
  });

  it("ships an additive database enum migration", () => {
    expect(migration).toContain('ALTER TYPE "public"."lead_lost_reason" ADD VALUE \'non_interesse\' BEFORE \'autre\';');
    expect(migration).not.toMatch(/DROP|DELETE|UPDATE/);
  });

  it("keeps the existing reopen stage behavior", () => {
    expect(defaultStageAfterReopen("conversation_in_progress")).toBe("conversation_in_progress");
    expect(defaultStageAfterReopen(null)).toBe("first_message_sent");
  });
});
