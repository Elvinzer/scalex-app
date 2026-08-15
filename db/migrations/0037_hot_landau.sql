CREATE TYPE "public"."staff_member_role" AS ENUM('support_agent', 'support_manager');--> statement-breakpoint
CREATE TYPE "public"."staff_member_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_message_visibility" AS ENUM('public', 'internal');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_notification_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_priority" AS ENUM('low', 'medium', 'high', 'blocking');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_status" AS ENUM('new', 'triage', 'in_progress', 'waiting_on_user', 'resolved', 'closed', 'duplicate', 'declined');--> statement-breakpoint
CREATE TYPE "public"."support_ticket_type" AS ENUM('bug', 'feature', 'question');--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "staff_member_role" DEFAULT 'support_agent' NOT NULL,
	"status" "staff_member_status" DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" uuid,
	"activated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "staff_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"source" text DEFAULT 'capture' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"staff_member_id" uuid,
	"event_type" text NOT NULL,
	"previous_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_ticket_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"staff_member_id" uuid,
	"visibility" "support_ticket_message_visibility" DEFAULT 'public' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"account_id" uuid NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"type" "support_ticket_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"context" jsonb NOT NULL,
	"status" "support_ticket_status" DEFAULT 'new' NOT NULL,
	"priority" "support_ticket_priority" DEFAULT 'medium' NOT NULL,
	"assigned_staff_id" uuid,
	"duplicate_of_ticket_id" uuid,
	"notification_status" "support_ticket_notification_status" DEFAULT 'pending' NOT NULL,
	"discord_message_id" text,
	"discord_last_error" text,
	"discord_last_attempt_at" timestamp with time zone,
	"idempotency_key" uuid NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "support_last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_staff_id_staff_members_id_fk" FOREIGN KEY ("assigned_staff_id") REFERENCES "public"."staff_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_duplicate_of_ticket_id_support_tickets_id_fk" FOREIGN KEY ("duplicate_of_ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_members_status_idx" ON "staff_members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_ticket_attachments_ticket_idx" ON "support_ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_ticket_attachments_expiry_idx" ON "support_ticket_attachments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "support_ticket_events_ticket_created_idx" ON "support_ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_created_idx" ON "support_ticket_messages" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_submitter_idempotency_idx" ON "support_tickets" USING btree ("submitted_by_user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "support_tickets_account_activity_idx" ON "support_tickets" USING btree ("account_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "support_tickets_status_activity_idx" ON "support_tickets" USING btree ("status","last_activity_at");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_status_idx" ON "support_tickets" USING btree ("assigned_staff_id","status");--> statement-breakpoint
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets" USING btree ("priority","last_activity_at");--> statement-breakpoint
CREATE POLICY "staff_members_self_read" ON "staff_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "support_ticket_attachments_staff_read" ON "support_ticket_attachments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
));--> statement-breakpoint
CREATE POLICY "support_ticket_events_staff_read" ON "support_ticket_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
));--> statement-breakpoint
CREATE POLICY "support_ticket_events_staff_insert" ON "support_ticket_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
));--> statement-breakpoint
CREATE POLICY "support_ticket_messages_read" ON "support_ticket_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((
        ("support_ticket_messages"."visibility" = 'public' and exists (
          select 1 from public.support_tickets as ticket
          where ticket.id = "support_ticket_messages"."ticket_id"
            and (ticket.account_id = (select auth.uid()) or ticket.submitted_by_user_id = (select auth.uid()))
        ))
        or exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)
      ));--> statement-breakpoint
CREATE POLICY "support_ticket_messages_insert" ON "support_ticket_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((
        "support_ticket_messages"."visibility" = 'public'
        and author_user_id = (select auth.uid())
        and exists (
          select 1 from public.support_tickets as ticket
          where ticket.id = "support_ticket_messages"."ticket_id"
            and public.native_booking_account_member(ticket.account_id)
        )
      ) or ("support_ticket_messages"."visibility" = 'internal' and exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)));--> statement-breakpoint
CREATE POLICY "support_tickets_read" ON "support_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((
        account_id = (select auth.uid())
        or submitted_by_user_id = (select auth.uid())
        or exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)
      ));--> statement-breakpoint
CREATE POLICY "support_tickets_insert" ON "support_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((
        submitted_by_user_id = (select auth.uid())
        and public.native_booking_account_member(account_id)
      ));--> statement-breakpoint
CREATE POLICY "support_tickets_staff_update" ON "support_tickets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)) WITH CHECK (exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
));--> statement-breakpoint

-- Support captures are private. The server uploads through the service-role
-- client and the Admin detail page creates short-lived signed URLs after its
-- own support:tickets permission check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-captures',
  'support-captures',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;--> statement-breakpoint

create policy "support_captures_staff_read" on storage.objects
for select to authenticated
using (
  bucket_id = 'support-captures'
  and exists (
    select 1
    from public.staff_members as support_staff
    where support_staff.user_id = (select auth.uid())
      and support_staff.status = 'active'
  )
);
