ALTER TYPE "public"."sale_payment_type" ADD VALUE 'subscription';--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "is_orphan" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
CREATE INDEX "sales_user_source_idx" ON "sales" USING btree ("user_id","source");--> statement-breakpoint
CREATE INDEX "sales_user_stripe_customer_idx" ON "sales" USING btree ("user_id","stripe_customer_id");--> statement-breakpoint
CREATE POLICY "sales_account_access" ON "sales" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("sales"."user_id")) WITH CHECK (public.native_booking_account_member("sales"."user_id"));