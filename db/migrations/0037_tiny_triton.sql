CREATE TABLE "booking_page_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"accent_color" text DEFAULT '#e8663c' NOT NULL,
	"background_type" text DEFAULT 'none' NOT NULL,
	"background_key" text,
	"background_url" text,
	"overlay_opacity" integer DEFAULT 40 NOT NULL,
	"background_position" text DEFAULT 'center' NOT NULL,
	"logo_url" text,
	"show_company_name" boolean DEFAULT true NOT NULL,
	"side_media_type" text DEFAULT 'none' NOT NULL,
	"side_media_url" text,
	"side_media_caption" text,
	"title" text,
	"subtitle" text,
	"emoji" text,
	"confirmation_message" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_page_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_page_settings" ADD CONSTRAINT "booking_page_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "booking_page_settings_account_access" ON "booking_page_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (public.native_booking_account_member("booking_page_settings"."user_id")) WITH CHECK (public.native_booking_account_member("booking_page_settings"."user_id"));
--> statement-breakpoint
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-assets',
  'booking-assets',
  false,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'video/mp4'];
