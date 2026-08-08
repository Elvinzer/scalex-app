ALTER TABLE "leads" ADD COLUMN "meta_touchpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "native_booking_leads" ADD COLUMN "meta_touchpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD COLUMN "meta_touchpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "meta_touchpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_calls" ADD COLUMN "meta_touchpoint_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_meta_touchpoint_id_meta_ad_touchpoints_id_fk" FOREIGN KEY ("meta_touchpoint_id") REFERENCES "public"."meta_ad_touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_booking_leads" ADD CONSTRAINT "native_booking_leads_meta_touchpoint_id_meta_ad_touchpoints_id_fk" FOREIGN KEY ("meta_touchpoint_id") REFERENCES "public"."meta_ad_touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_bookings" ADD CONSTRAINT "native_bookings_meta_touchpoint_id_meta_ad_touchpoints_id_fk" FOREIGN KEY ("meta_touchpoint_id") REFERENCES "public"."meta_ad_touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_meta_touchpoint_id_meta_ad_touchpoints_id_fk" FOREIGN KEY ("meta_touchpoint_id") REFERENCES "public"."meta_ad_touchpoints"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_calls" ADD CONSTRAINT "sales_calls_meta_touchpoint_id_meta_ad_touchpoints_id_fk" FOREIGN KEY ("meta_touchpoint_id") REFERENCES "public"."meta_ad_touchpoints"("id") ON DELETE set null ON UPDATE no action;