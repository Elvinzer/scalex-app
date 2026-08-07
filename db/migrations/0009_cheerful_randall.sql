CREATE TABLE "stripe_insight_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_version" text DEFAULT 'v1' NOT NULL,
	"period_start" date,
	"period_end" date,
	"currency" text NOT NULL,
	"focus_signal_type" text,
	"snapshot" jsonb NOT NULL,
	"signals" jsonb NOT NULL,
	"insight_text" text NOT NULL,
	"key_source" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_insight_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_transaction_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"stripe_refund_id" text NOT NULL,
	"stripe_charge_id" text,
	"payment_intent_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_transaction_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"stripe_account_id" text NOT NULL,
	"stripe_charge_id" text NOT NULL,
	"payment_intent_id" text,
	"customer_id" text,
	"invoice_id" text,
	"subscription_id" text,
	"amount_cents" integer NOT NULL,
	"amount_refunded_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"payment_type" text DEFAULT 'unknown' NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN "last_sync_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN "last_sync_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD COLUMN "last_sync_error" text;--> statement-breakpoint
ALTER TABLE "stripe_insight_runs" ADD CONSTRAINT "stripe_insight_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transaction_refunds" ADD CONSTRAINT "stripe_transaction_refunds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_transactions" ADD CONSTRAINT "stripe_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_insight_runs_user_created_idx" ON "stripe_insight_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_transaction_refunds_account_refund_idx" ON "stripe_transaction_refunds" USING btree ("user_id","stripe_account_id","stripe_refund_id");--> statement-breakpoint
CREATE INDEX "stripe_transaction_refunds_user_charge_idx" ON "stripe_transaction_refunds" USING btree ("user_id","stripe_charge_id");--> statement-breakpoint
CREATE INDEX "stripe_transaction_refunds_user_occurred_idx" ON "stripe_transaction_refunds" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_transactions_account_charge_idx" ON "stripe_transactions" USING btree ("user_id","stripe_account_id","stripe_charge_id");--> statement-breakpoint
CREATE INDEX "stripe_transactions_user_occurred_idx" ON "stripe_transactions" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stripe_transactions_user_currency_idx" ON "stripe_transactions" USING btree ("user_id","currency");--> statement-breakpoint
CREATE INDEX "stripe_transactions_user_customer_idx" ON "stripe_transactions" USING btree ("user_id","customer_id");--> statement-breakpoint
CREATE POLICY "stripe_insight_runs_account_access" ON "stripe_insight_runs" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("stripe_insight_runs"."user_id")) WITH CHECK (public.native_booking_account_member("stripe_insight_runs"."user_id"));--> statement-breakpoint
CREATE POLICY "stripe_transaction_refunds_account_access" ON "stripe_transaction_refunds" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("stripe_transaction_refunds"."user_id")) WITH CHECK (public.native_booking_account_member("stripe_transaction_refunds"."user_id"));--> statement-breakpoint
CREATE POLICY "stripe_transactions_account_access" ON "stripe_transactions" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("stripe_transactions"."user_id")) WITH CHECK (public.native_booking_account_member("stripe_transactions"."user_id"));