import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0068_light_surge.sql", import.meta.url), "utf8");
const normalizationMigration = readFileSync(new URL("../../db/migrations/0069_tidy_crm_profile_urls.sql", import.meta.url), "utf8");

describe("multi-channel CRM migration", () => {
  it("creates account-scoped profiles with network and lead uniqueness", () => {
    expect(migration).toContain('CREATE TABLE "crm_lead_profiles"');
    expect(migration).toContain('ALTER TABLE "crm_lead_profiles" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE UNIQUE INDEX "crm_lead_profiles_account_platform_url_idx"');
    expect(migration).toContain('CREATE UNIQUE INDEX "crm_lead_profiles_account_lead_platform_idx"');
    expect(migration).toContain('public.native_booking_account_member("crm_lead_profiles"."account_id")');
    expect(migration).toContain('l.account_id = "crm_lead_profiles"."account_id"');
  });

  it("backfills legacy identity fields additively and records conflicts", () => {
    expect(migration).toContain('ADD COLUMN "email_normalized"');
    expect(migration).toContain('UPDATE "leads"');
    expect(migration).toContain("wa[.]me");
    expect(migration).toContain('INSERT INTO "crm_lead_profiles"');
    expect(migration).toContain("ON CONFLICT DO NOTHING");
    expect(migration).toContain("legacy-profile-conflict");
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM/);
  });

  it("normalizes legacy URLs without silently merging collisions", () => {
    expect(normalizationMigration).toContain("profile-url-normalization-conflict");
    expect(normalizationMigration).toContain("row_number() OVER");
    expect(normalizationMigration).toContain("normalized_rank = 1");
    expect(normalizationMigration).toContain("regexp_replace");
    expect(normalizationMigration).toContain("ON CONFLICT DO NOTHING");
    expect(normalizationMigration).not.toMatch(/DROP TABLE|DELETE FROM/);
  });
});
