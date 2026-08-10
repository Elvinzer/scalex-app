CREATE TYPE "public"."activity_source" AS ENUM('content_published', 'email_sent', 'business_progress', 'checkin_filled', 'lead_worked');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sources" "activity_source"[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_log_user_id_date_pk" PRIMARY KEY("user_id","date")
);
--> statement-breakpoint
ALTER TABLE "activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"grace_used_month" integer DEFAULT 0 NOT NULL,
	"grace_month" text,
	"weekly_goal" integer DEFAULT 3 NOT NULL,
	"goal_updated_at" timestamp with time zone,
	"weekly_goal_is_manual" boolean DEFAULT false NOT NULL,
	"last_auto_goal_month" text,
	"last_milestone_celebrated" integer DEFAULT 0 NOT NULL,
	"reminder_opt_in" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "streaks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "activity_log_account_access" ON "activity_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("activity_log"."user_id")) WITH CHECK (public.native_booking_account_member("activity_log"."user_id"));--> statement-breakpoint
CREATE POLICY "streaks_account_access" ON "streaks" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("streaks"."user_id")) WITH CHECK (public.native_booking_account_member("streaks"."user_id"));