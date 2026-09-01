CREATE INDEX "crm_actions_account_source_idx" ON "crm_actions" USING btree ("account_id","source","source_id");--> statement-breakpoint

-- Backfill only leads that do not have a CRM event yet. New CRM captures are
-- therefore left untouched if deployment and migration overlap.
UPDATE "leads" AS l
SET
  "crm_stage" = CASE
    WHEN l."stage" IN ('rdv_fixe', 'rdv_honore', 'close') THEN 'call_booked'::"crm_lead_stage"
    WHEN l."stage" = 'conversation' THEN 'conversation_in_progress'::"crm_lead_stage"
    ELSE 'first_message_sent'::"crm_lead_stage"
  END,
  "crm_outcome" = CASE
    WHEN l."stage" = 'close' OR l."sale_id" IS NOT NULL THEN 'sold'::"crm_lead_outcome"
    WHEN l."stage" = 'perdu' THEN 'lost'::"crm_lead_outcome"
    WHEN l."is_no_show" THEN 'no_show'::"crm_lead_outcome"
    ELSE 'none'::"crm_lead_outcome"
  END
WHERE NOT EXISTS (
  SELECT 1 FROM "crm_lead_events" AS e
  WHERE e."account_id" = l."account_id" AND e."lead_id" = l."id"
);--> statement-breakpoint

INSERT INTO "crm_lead_stage_history" ("account_id", "lead_id", "from_stage", "to_stage", "actor_user_id", "responsible_setter_id", "source", "changed_at")
SELECT l."account_id", l."id", NULL, l."crm_stage", l."user_id", l."setter_id", 'migration'::"crm_event_source", l."updated_at"
FROM "leads" AS l
WHERE NOT EXISTS (
  SELECT 1 FROM "crm_lead_stage_history" AS h
  WHERE h."account_id" = l."account_id" AND h."lead_id" = l."id"
);--> statement-breakpoint

INSERT INTO "crm_lead_events" ("account_id", "lead_id", "actor_user_id", "type", "source", "source_event_key", "occurred_at", "captured_at", "metadata")
SELECT l."account_id", l."id", l."user_id", 'lead_created'::"crm_event_type", 'migration'::"crm_event_source", 'migration:lead:' || l."id", NULL, l."created_at", jsonb_build_object('legacyStage', l."stage", 'legacyOutcome', l."crm_outcome")
FROM "leads" AS l
WHERE NOT EXISTS (
  SELECT 1 FROM "crm_lead_events" AS e
  WHERE e."account_id" = l."account_id" AND e."lead_id" = l."id" AND e."type" = 'lead_created'::"crm_event_type"
);--> statement-breakpoint

INSERT INTO "crm_lead_events" ("account_id", "lead_id", "actor_user_id", "type", "source", "source_event_key", "occurred_at", "captured_at", "metadata")
SELECT l."account_id", l."id", l."user_id", 'profile_captured'::"crm_event_type", 'migration'::"crm_event_source", 'migration:profile:' || l."id", l."message_occurred_at", COALESCE(l."captured_at", l."created_at"), jsonb_build_object('platform', l."platform", 'handle', l."normalized_handle", 'mode', 'legacy')
FROM "leads" AS l
WHERE l."platform" IS NOT NULL AND l."canonical_profile_url" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "crm_lead_events" AS e
    WHERE e."account_id" = l."account_id" AND e."lead_id" = l."id" AND e."type" = 'profile_captured'::"crm_event_type"
  );--> statement-breakpoint

INSERT INTO "crm_lead_events" ("account_id", "lead_id", "actor_user_id", "type", "source", "source_event_key", "occurred_at", "captured_at", "metadata")
SELECT l."account_id", l."id", l."user_id", 'first_message_sent'::"crm_event_type", 'migration'::"crm_event_source", 'migration:first-message:' || l."id", l."message_occurred_at", COALESCE(l."captured_at", l."created_at"), jsonb_build_object('legacyStage', l."stage")
FROM "leads" AS l
WHERE l."message_occurred_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "crm_lead_events" AS e
    WHERE e."account_id" = l."account_id" AND e."lead_id" = l."id" AND e."type" = 'first_message_sent'::"crm_event_type"
  );--> statement-breakpoint

INSERT INTO "crm_lead_events" ("account_id", "lead_id", "actor_user_id", "type", "source", "source_event_key", "occurred_at", "captured_at", "metadata")
SELECT l."account_id", l."id", l."user_id", CASE
  WHEN l."crm_outcome" = 'sold'::"crm_lead_outcome" THEN 'sale_validated'::"crm_event_type"
  WHEN l."crm_outcome" = 'lost'::"crm_lead_outcome" THEN 'lead_lost'::"crm_event_type"
  ELSE 'no_show_marked'::"crm_event_type"
END, 'migration'::"crm_event_source", 'migration:outcome:' || l."id", NULL, l."updated_at", jsonb_build_object('legacyStage', l."stage", 'saleId', l."sale_id")
FROM "leads" AS l
WHERE l."crm_outcome" <> 'none'::"crm_lead_outcome"
  AND NOT EXISTS (
    SELECT 1 FROM "crm_lead_events" AS e
    WHERE e."account_id" = l."account_id" AND e."lead_id" = l."id" AND e."source_event_key" = 'migration:outcome:' || l."id"
  );--> statement-breakpoint

INSERT INTO "crm_lead_events" ("account_id", "lead_id", "actor_user_id", "type", "source", "source_event_key", "occurred_at", "captured_at", "metadata")
SELECT l."account_id", c."lead_id", c."user_id", 'note_added'::"crm_event_type", 'migration'::"crm_event_source", 'migration:comment:' || c."id", NULL, c."created_at", jsonb_build_object('commentId', c."id")
FROM "lead_comments" AS c
INNER JOIN "leads" AS l ON l."id" = c."lead_id"
WHERE NOT EXISTS (
  SELECT 1 FROM "crm_lead_events" AS e
  WHERE e."account_id" = l."account_id" AND e."lead_id" = c."lead_id" AND e."source_event_key" = 'migration:comment:' || c."id"
);--> statement-breakpoint

INSERT INTO "crm_actions" ("account_id", "lead_id", "category", "type", "title", "due_at", "status", "priority", "responsible_user_id", "created_by_user_id", "completed_at", "completed_by_user_id", "source", "source_id", "idempotency_key")
SELECT l."account_id", l."id", 'prospecting'::"crm_action_category", 'follow_up', COALESCE(NULLIF(BTRIM(l."reminder_note"), ''), 'Relance lead'), (l."reminder_date"::timestamp AT TIME ZONE 'UTC'), CASE WHEN l."reminder_done" THEN 'completed'::"crm_action_status" ELSE 'open'::"crm_action_status" END, 0, COALESCE(s."user_id", l."user_id"), l."user_id", CASE WHEN l."reminder_done" THEN l."updated_at" ELSE NULL END, CASE WHEN l."reminder_done" THEN l."user_id" ELSE NULL END, 'migration'::"crm_event_source", 'legacy-reminder:' || l."id", 'legacy-reminder:' || l."id"
FROM "leads" AS l
LEFT JOIN "setters" AS s ON s."id" = l."setter_id" AND s."user_id" = l."account_id"
WHERE l."reminder_date" IS NOT NULL
ON CONFLICT ("account_id", "idempotency_key") DO NOTHING;
