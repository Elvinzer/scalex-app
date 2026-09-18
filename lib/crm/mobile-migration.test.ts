import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0057_special_krista_starr.sql", import.meta.url), "utf8");
const indexMigration = readFileSync(new URL("../../db/migrations/0058_familiar_dakota_north.sql", import.meta.url), "utf8");
const actionMigration = readFileSync(new URL("../../db/migrations/0059_luxuriant_dreaming_celestial.sql", import.meta.url), "utf8");

describe("mobile CRM migration", () => {
  it("adds the workflow fields and call time zone without creating synthetic events", () => {
    expect(migration).toContain('CREATE TYPE "public"."crm_lead_contact_state"');
    expect(migration).toContain('ADD COLUMN "contact_state"');
    expect(migration).toContain('ADD COLUMN "responded_at"');
    expect(migration).toContain('ADD COLUMN "qualification_note"');
    expect(migration).toContain('ADD COLUMN "time_zone"');
    expect(migration).not.toContain('INSERT INTO "crm_lead_events"');
  });

  it("backfills only reliable first-message and response events", () => {
    expect(migration).toContain('e."type" = \'first_message_sent\'');
    expect(migration).toContain('"type" = \'response_received\'');
    expect(migration).not.toContain('"type" = \'qualification_updated\'');
  });

  it("keeps the account-created ordering index in the migration history", () => {
    expect(indexMigration).toContain('CREATE INDEX "leads_account_created_idx"');
  });

  it("adds an explicit audit event for action rescheduling", () => {
    expect(actionMigration).toContain("ADD VALUE 'action_rescheduled'");
  });
});
