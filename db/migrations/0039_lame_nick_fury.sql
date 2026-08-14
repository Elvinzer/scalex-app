CREATE TYPE "public"."client_journey_column_type" AS ENUM('entry', 'progression', 'risk', 'success', 'end');--> statement-breakpoint
CREATE TYPE "public"."client_journey_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."testimonial_media_type" AS ENUM('photo', 'video', 'link', 'text');--> statement-breakpoint
CREATE TABLE "client_journey_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_journey_id" uuid NOT NULL,
	"from_column_id" uuid,
	"to_column_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_name" text NOT NULL,
	"sale_id" uuid,
	"offer_id" text,
	"column_id" uuid NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"column_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "client_journey_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_journeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_journey_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_journey_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_journey_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"note" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journey_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "client_journey_column_type" DEFAULT 'progression' NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journey_columns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_type" "testimonial_media_type" NOT NULL,
	"file_url" text,
	"external_url" text,
	"text" text,
	"client_name" text NOT NULL,
	"client_journey_id" uuid,
	"offer_id" text,
	"result_text" text,
	"consent" boolean DEFAULT false NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "testimonials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ADD CONSTRAINT "client_journey_stage_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ADD CONSTRAINT "client_journey_stage_history_client_journey_id_client_journeys_id_fk" FOREIGN KEY ("client_journey_id") REFERENCES "public"."client_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ADD CONSTRAINT "client_journey_stage_history_from_column_id_journey_columns_id_fk" FOREIGN KEY ("from_column_id") REFERENCES "public"."journey_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ADD CONSTRAINT "client_journey_stage_history_to_column_id_journey_columns_id_fk" FOREIGN KEY ("to_column_id") REFERENCES "public"."journey_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journeys" ADD CONSTRAINT "client_journeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journeys" ADD CONSTRAINT "client_journeys_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_journeys" ADD CONSTRAINT "client_journeys_column_id_journey_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."journey_columns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_milestones" ADD CONSTRAINT "client_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_milestones" ADD CONSTRAINT "client_milestones_client_journey_id_client_journeys_id_fk" FOREIGN KEY ("client_journey_id") REFERENCES "public"."client_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_journey_id_client_journeys_id_fk" FOREIGN KEY ("client_journey_id") REFERENCES "public"."client_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_client_journey_id_client_journeys_id_fk" FOREIGN KEY ("client_journey_id") REFERENCES "public"."client_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_columns" ADD CONSTRAINT "journey_columns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_client_journey_id_client_journeys_id_fk" FOREIGN KEY ("client_journey_id") REFERENCES "public"."client_journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_journey_stage_history_journey_idx" ON "client_journey_stage_history" USING btree ("client_journey_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "client_journeys_user_sale_idx" ON "client_journeys" USING btree ("user_id","sale_id");--> statement-breakpoint
CREATE INDEX "client_journeys_user_column_idx" ON "client_journeys" USING btree ("user_id","column_id");--> statement-breakpoint
CREATE INDEX "client_journeys_user_activity_idx" ON "client_journeys" USING btree ("user_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "client_milestones_journey_position_idx" ON "client_milestones" USING btree ("client_journey_id","position");--> statement-breakpoint
CREATE INDEX "client_notes_journey_created_idx" ON "client_notes" USING btree ("client_journey_id","created_at");--> statement-breakpoint
CREATE INDEX "client_reminders_journey_date_idx" ON "client_reminders" USING btree ("client_journey_id","remind_at");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_columns_user_order_idx" ON "journey_columns" USING btree ("user_id","order");--> statement-breakpoint
CREATE INDEX "journey_columns_user_idx" ON "journey_columns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "testimonials_user_date_idx" ON "testimonials" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "testimonials_user_consent_idx" ON "testimonials" USING btree ("user_id","consent");--> statement-breakpoint
CREATE POLICY "client_journey_stage_history_account_access" ON "client_journey_stage_history" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("client_journey_stage_history"."user_id")) WITH CHECK (public.native_booking_account_member("client_journey_stage_history"."user_id"));--> statement-breakpoint
CREATE POLICY "client_journeys_account_access" ON "client_journeys" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("client_journeys"."user_id")) WITH CHECK (public.native_booking_account_member("client_journeys"."user_id"));--> statement-breakpoint
CREATE POLICY "client_milestones_account_access" ON "client_milestones" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("client_milestones"."user_id")) WITH CHECK (public.native_booking_account_member("client_milestones"."user_id"));--> statement-breakpoint
CREATE POLICY "client_notes_account_access" ON "client_notes" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("client_notes"."user_id")) WITH CHECK (public.native_booking_account_member("client_notes"."user_id"));--> statement-breakpoint
CREATE POLICY "client_reminders_account_access" ON "client_reminders" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("client_reminders"."user_id")) WITH CHECK (public.native_booking_account_member("client_reminders"."user_id"));--> statement-breakpoint
CREATE POLICY "journey_columns_account_access" ON "journey_columns" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("journey_columns"."user_id")) WITH CHECK (public.native_booking_account_member("journey_columns"."user_id"));--> statement-breakpoint
CREATE POLICY "testimonials_account_access" ON "testimonials" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("testimonials"."user_id")) WITH CHECK (public.native_booking_account_member("testimonials"."user_id"));