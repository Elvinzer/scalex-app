CREATE TYPE "public"."crm_lead_contact_state" AS ENUM('new', 'contacted');--> statement-breakpoint
ALTER TYPE "public"."crm_event_type" ADD VALUE 'qualification_updated';--> statement-breakpoint
ALTER TYPE "public"."crm_event_type" ADD VALUE 'booking_link_sent';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "closer_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_state" "crm_lead_contact_state" DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "qualification_note" text;--> statement-breakpoint
ALTER TABLE "sales_calls" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "leads" AS l
SET "contact_state" = 'contacted'
WHERE EXISTS (
  SELECT 1
  FROM "crm_lead_events" AS e
  WHERE e."account_id" = l."account_id"
    AND e."lead_id" = l."id"
    AND e."type" = 'first_message_sent'
);--> statement-breakpoint
UPDATE "leads" AS l
SET "responded_at" = response."occurred_at"
FROM (
  SELECT DISTINCT ON ("lead_id") "lead_id", COALESCE("occurred_at", "created_at") AS "occurred_at"
  FROM "crm_lead_events"
  WHERE "type" = 'response_received'
  ORDER BY "lead_id", COALESCE("occurred_at", "created_at") ASC
) AS response
WHERE response."lead_id" = l."id" AND l."responded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "leads_account_contact_state_idx" ON "leads" USING btree ("account_id","contact_state");--> statement-breakpoint
CREATE INDEX "leads_account_responded_idx" ON "leads" USING btree ("account_id","responded_at");
