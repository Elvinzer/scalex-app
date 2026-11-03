# Historical foreign key compatibility

The configured database used `video_attributions_user_id_fkey`, while the generated historical schema used `video_attributions_user_id_users_id_fk`. The initial official migration attempt rolled back without applying a migration row or creating businesses.

Migration 0072 now drops either historical name with `IF EXISTS`, then creates the same validated foreign key to businesses. No source migration had been applied to the shared database before this adjustment.

Reproduction: `MULTI_BUSINESS_MIGRATION_LEGACY_FK_ALIAS=1 npm run test:business-migration`. This renames the baseline constraint to the observed historical name before running the official migration command twice. All 265 assertions passed. Raw evidence: `migration-legacy-fk-verification.json` and `.log`. The canonical baseline is separately tested by the default command.

A rollback-only diagnostic transaction on the configured database also accepted both complete migration SQL files after this adjustment; that diagnostic left no persisted changes.
