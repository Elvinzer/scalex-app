# Official migration-runner verification

Result: **passed**.

Started: 2026-11-03T11:20:39.663Z.
Pre-change schema: `6ab432981e5d5e3638f437de5f4aef079c068ab2`.
Disposable database retained: `minaly_multibusiness_migration_20261103_5be73b8d` on loopback only.

Run again with `npm run test:business-migration`. Each run creates a new database; it never drops or reuses an existing one. The local PostgreSQL role must be able to create databases. An optional `--admin-url` must target the loopback postgres maintenance database.

The script generates a full baseline from the Git revision, initializes the local auth bootstrap, seeds legacy data and records the 72 original migration hashes/timestamps. It then runs the real `npm run db:migrate` command twice, including the platform-admin synchronization script. It does not contact Supabase, Stripe or other vendors.

Assertions:

- PASS: administrative connection is loopback.
- PASS: target is a newly created disposable database.
- PASS: baseline is the full pre-change schema.
- PASS: baseline journal ends at migration 71.
- PASS: official runner applied migrations 72 and 73.
- PASS: history contains exactly one row per journal entry.
- PASS: 0072_independent_businesses hash and timestamp match its source.
- PASS: 0073_harden_business_control_records hash and timestamp match its source.
- PASS: all pre-change history hashes and timestamps are retained.
- PASS: exactly the two legacy businesses are preserved.
- PASS: legacy business ownership is preserved.
- PASS: invitation-only identity is not materialized as a business.
- PASS: owner membership in another business is retained.
- PASS: booking handles are preserved.
- PASS: subscription customer backfill is preserved.
- PASS: legacy sales amounts remain attached to their businesses.
- PASS: legacy Stripe subscription identities are retained.
- PASS: platform admin roster was synchronized by the official script.
- PASS: all three new tables have RLS enabled.
- PASS: no orphaned foreign keys or foreign business scope references.
- PASS: authenticated owner can read existing billing for recovery.
- PASS: authenticated owner can update its operational business profile.
- PASS: authenticated client cannot forge subscription state.
- PASS: authenticated client cannot forge subscription deletion.
- PASS: authenticated client cannot forge referral rates.
- PASS: authenticated client cannot forge referral payouts.
- PASS: authenticated client cannot forge shared usage quota.
- PASS: authenticated client cannot forge token usage accounting.
- PASS: legitimate cross-business referral and commission are accepted.
- PASS: old writer bridge updates only the unambiguous initial business.
- PASS: initial business configuration synchronizes back to legacy writers.
- PASS: second business configuration does not alter the initial business or personal mirror.
- PASS: second official run leaves every public table and migration row unchanged.

Detailed counts, source hashes and timestamps are in migration-verification.json. Raw local command output is in migration-verification.log. This reconstructs the schema at migration 71; it does not claim that the existing migration history can initialize an empty installation without the generated baseline.

The repeated-run comparison checks logical row contents. The platform-admin synchronization intentionally replaces its roster rows on every run with the same configured values.
