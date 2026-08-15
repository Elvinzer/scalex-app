import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0042_last_violations.sql", import.meta.url), "utf8");

describe("support migration", () => {
  it("creates private capture storage and staff-only reads", () => {
    expect(migration).toContain("'support-captures'");
    expect(migration).toContain("public = false");
    expect(migration).toContain('create policy "support_captures_staff_read"');
  });

  it("keeps idempotency and access policies in the database", () => {
    expect(migration).toContain('CREATE UNIQUE INDEX "support_tickets_submitter_idempotency_idx"');
    expect(migration).toContain('CREATE POLICY "support_tickets_read"');
    expect(migration).toContain('CREATE POLICY "support_ticket_messages_insert"');
    expect(migration).toContain('CREATE POLICY "support_ticket_events_staff_read"');
  });
});
