ALTER TABLE "crm_call_match_suggestions" ADD COLUMN "decision" text;--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD COLUMN "decided_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD CONSTRAINT "crm_call_match_suggestions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;