-- Independent business identities. Expand/backfill preserves legacy writers and public IDs.
-- Legacy configuration columns intentionally remain until compatibility removal is safe.
CREATE TABLE "agent_token_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"key_source" text NOT NULL,
	"operation" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_token_usage_nonnegative" CHECK ("agent_token_usage"."input_tokens" >= 0 and "agent_token_usage"."output_tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_token_usage" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"billing_exempt" boolean DEFAULT false NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"creation_request_id" uuid,
	"checkout_session_id" text,
	"checkout_session_url" text,
	"checkout_session_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anthropic_api_key_encrypted" text,
	"anthropic_api_key_invalid" boolean DEFAULT false NOT NULL,
	"stripe_connect_id" text,
	"stripe_customer_id" text,
	"iclosed_connected" boolean DEFAULT false NOT NULL,
	"calendly_connected" boolean DEFAULT false NOT NULL,
	"instagram_connected" boolean DEFAULT false NOT NULL,
	"youtube_connected" boolean DEFAULT false NOT NULL,
	"meta_ads_connected" boolean DEFAULT false NOT NULL,
	"sector" "prospection_sector",
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"business_profile_completed_at" timestamp with time zone,
	"weekly_email_enabled" boolean DEFAULT true NOT NULL,
	"is_test_account" boolean DEFAULT false NOT NULL,
	"last_improve_metric_key" text,
	"last_improve_metric_rate_snapshot" real,
	"last_weekly_brief_sent_at" timestamp with time zone,
	"advanced_modules_enabled" boolean DEFAULT false NOT NULL,
	"crm_enabled" boolean DEFAULT false NOT NULL,
	"booking_handle" text,
	CONSTRAINT "businesses_creation_request_id_unique" UNIQUE("creation_request_id")
);
--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE "platform_admin_emails" (
	"email" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_admin_emails" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "payment_blocked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "latest_invoice_id" text;
--> statement-breakpoint
-- Preserve legacy ownership even when its owner currently belongs to another team.
WITH referenced_businesses AS (SELECT "user_id" AS id FROM public."activity_log" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."ad_campaigns" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."agent_chat_messages" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."booking_page_settings" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."business_levers" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."business_profile" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."calendly_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."client_journey_stage_history" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."client_journeys" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."client_milestones" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."client_notes" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."client_reminders" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."closing_kpi_entries" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."closing_videos" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."content_posts" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."content_recommendations" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."conversations" WHERE "user_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_actions" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_call_links" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_call_match_suggestions" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_imports" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_lead_events" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_lead_profiles" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_lead_stage_history" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_message_ab_test_assignments" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_message_ab_tests" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."crm_responsibility_history" WHERE "account_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."data_imports" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."diagnostics" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."email_campaigns" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."funnel_stage_insights" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."iclosed_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."improvement_events" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."improvement_initiatives" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."initiative_measurements" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."initiative_nudges" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."initiative_weekly_focus" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."insight_records" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."instagram_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."instagram_post_insights" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."journal_notes" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."journey_columns" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."leads" WHERE "user_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."leads" WHERE "account_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."lever_starter_progress" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_accounts" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_action_logs" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_metric_corrections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_metrics_daily" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_sets" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ad_touchpoints" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ads" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_ads_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_campaign_profiles" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."meta_campaigns" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."monthly_metrics" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_booking_calendar_conflicts" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_booking_calendar_settings" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_booking_events" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_booking_leads" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_booking_links" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_bookings" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."native_calendar_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."projects" WHERE "user_id" IS NOT NULL UNION SELECT "referrer_account_id" AS id FROM public."referral_attributions" WHERE "referrer_account_id" IS NOT NULL UNION SELECT "referred_account_id" AS id FROM public."referral_attributions" WHERE "referred_account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."referral_codes" WHERE "account_id" IS NOT NULL UNION SELECT "referrer_account_id" AS id FROM public."referral_commissions" WHERE "referrer_account_id" IS NOT NULL UNION SELECT "referred_account_id" AS id FROM public."referral_commissions" WHERE "referred_account_id" IS NOT NULL UNION SELECT "referrer_account_id" AS id FROM public."referral_payouts" WHERE "referrer_account_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."sales" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."sales_calls" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."scale_score_history" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."setters" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."setting_kpi_entries" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."shared_agent_usage" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."streaks" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."stripe_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."stripe_insight_runs" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."stripe_transaction_refunds" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."stripe_transactions" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."subscriptions" WHERE "user_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."support_tickets" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."team_members" WHERE "account_id" IS NOT NULL UNION SELECT "account_id" AS id FROM public."team_roles" WHERE "account_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."testimonials" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."todos" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."video_attributions" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."weekly_reports" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."winning_patterns" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_card_metrics" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_connections" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_end_screen_metrics" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_reporting_jobs" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_reporting_reports" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_video_insights" WHERE "user_id" IS NOT NULL UNION SELECT "user_id" AS id FROM public."youtube_video_snapshots" WHERE "user_id" IS NOT NULL)
INSERT INTO public.businesses(id,owner_user_id,name,status,is_initial,created_at,"anthropic_api_key_encrypted", "anthropic_api_key_invalid", "stripe_connect_id", "stripe_customer_id", "iclosed_connected", "calendly_connected", "instagram_connected", "youtube_connected", "meta_ads_connected", "sector", "onboarding_completed", "business_profile_completed_at", "weekly_email_enabled", "is_test_account", "last_improve_metric_key", "last_improve_metric_rate_snapshot", "last_weekly_brief_sent_at", "advanced_modules_enabled", "crm_enabled", "booking_handle")
SELECT u.id,u.id,coalesce(nullif(trim(p.identity->>'businessName'),''),nullif(trim(u.display_name),''),split_part(u.email,'@',1)),
'active',true,u.created_at,u."anthropic_api_key_encrypted", u."anthropic_api_key_invalid", u."stripe_connect_id", u."stripe_customer_id", u."iclosed_connected", u."calendly_connected", u."instagram_connected", u."youtube_connected", u."meta_ads_connected", u."sector", u."onboarding_completed", u."business_profile_completed_at", u."weekly_email_enabled", u."is_test_account", u."last_improve_metric_key", u."last_improve_metric_rate_snapshot", u."last_weekly_brief_sent_at", u."advanced_modules_enabled", u."crm_enabled", u."booking_handle"
FROM public.users u LEFT JOIN public.business_profile p ON p.user_id=u.id
WHERE u.id IN (SELECT id FROM referenced_businesses)
 OR u.onboarding_completed OR u.anthropic_api_key_encrypted IS NOT NULL OR u.booking_handle IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.member_user_id=u.id)
ON CONFLICT(id) DO NOTHING;
--> statement-breakpoint

-- Helpers are callable only by authenticated database roles. They resolve
-- business ownership through records, never by equating business and auth IDs.
CREATE OR REPLACE FUNCTION public.business_owner(business_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RETURN EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.owner_user_id=auth.uid()); END; $f$;
CREATE OR REPLACE FUNCTION public.business_identity_member(business_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RETURN EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=business_id AND b.status<>'archived' AND
 (b.owner_user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.team_members m WHERE m.account_id=b.id AND m.member_user_id=auth.uid() AND m.status='active'))); END; $f$;
CREATE OR REPLACE FUNCTION public.business_billing_active(business_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RETURN EXISTS(SELECT 1 FROM public.businesses b JOIN public.users u ON u.id=b.owner_user_id
 LEFT JOIN public.subscriptions s ON s.user_id=b.id
 WHERE b.id=business_id AND b.status<>'archived' AND
 ((b.billing_exempt AND EXISTS(SELECT 1 FROM public.platform_admin_emails a WHERE a.email=lower(u.email))) OR
 (s.status IN ('active','trialing') AND s.payment_blocked_at IS NULL AND (s.current_period_end IS NULL OR s.current_period_end>now())))); END; $f$;
CREATE OR REPLACE FUNCTION public.native_booking_account_member(account_owner_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RETURN public.business_billing_active(account_owner_id) AND
 (public.business_owner(account_owner_id) OR
 (public.business_identity_member(account_owner_id) AND EXISTS(SELECT 1 FROM public.businesses b JOIN public.users u ON u.id=b.owner_user_id
 LEFT JOIN public.subscriptions s ON s.user_id=b.id LEFT JOIN public.subscription_plans p ON p.id=s.plan_id
 WHERE b.id=account_owner_id AND
 ((b.billing_exempt AND EXISTS(SELECT 1 FROM public.platform_admin_emails a WHERE a.email=lower(u.email))) OR p.features->>'teamMembersEnabled'='true')))); END; $f$;
CREATE OR REPLACE FUNCTION public.business_permission_member(business_id uuid,permission_keys text[]) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF NOT public.native_booking_account_member(business_id) THEN RETURN false; END IF;
 IF public.business_owner(business_id) THEN RETURN true; END IF;
 IF cardinality(permission_keys)=0 THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.team_members m JOIN public.team_member_roles mr ON mr.team_member_id=m.id
 JOIN public.team_roles r ON r.id=mr.role_id AND r.account_id=m.account_id
 CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) AS grant_key(value)
 WHERE m.account_id=business_id AND m.member_user_id=auth.uid() AND m.status='active'
 AND (grant_key.value=ANY(permission_keys)
 OR (grant_key.value='acquisition:setting' AND permission_keys && ARRAY['acquisition:pipeline','acquisition:setters'])
 OR (grant_key.value='ventes:closing' AND 'ventes:appels'=ANY(permission_keys))));
END; $f$;
CREATE OR REPLACE FUNCTION public.native_booking_event_viewer(booking_event_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN RETURN EXISTS(SELECT 1 FROM public.native_booking_events e WHERE e.id=booking_event_id
 AND public.business_permission_member(e.user_id,ARRAY['ventes:rdv']) AND
 (public.business_owner(e.user_id) OR EXISTS(SELECT 1 FROM public.native_booking_event_closers a
 WHERE a.event_id=e.id AND a.closer_user_id=auth.uid() AND a.is_active))); END; $f$;
REVOKE ALL ON FUNCTION public.business_owner(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.business_owner(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.business_identity_member(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.business_identity_member(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.business_billing_active(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.business_billing_active(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.native_booking_account_member(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.native_booking_account_member(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.business_permission_member(uuid,text[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.business_permission_member(uuid,text[]) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.native_booking_event_viewer(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.native_booking_event_viewer(uuid) TO authenticated,service_role;
--> statement-breakpoint
ALTER TABLE "activity_log" DROP CONSTRAINT "activity_log_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ad_campaigns" DROP CONSTRAINT "ad_campaigns_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "agent_chat_messages" DROP CONSTRAINT "agent_chat_messages_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "booking_page_settings" DROP CONSTRAINT "booking_page_settings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "business_levers" DROP CONSTRAINT "business_levers_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "business_profile" DROP CONSTRAINT "business_profile_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "calendly_connections" DROP CONSTRAINT "calendly_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" DROP CONSTRAINT "client_journey_stage_history_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_journeys" DROP CONSTRAINT "client_journeys_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_milestones" DROP CONSTRAINT "client_milestones_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_notes" DROP CONSTRAINT "client_notes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_reminders" DROP CONSTRAINT "client_reminders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "closing_kpi_entries" DROP CONSTRAINT "closing_kpi_entries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "closing_videos" DROP CONSTRAINT "closing_videos_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "content_posts" DROP CONSTRAINT "content_posts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "content_recommendations" DROP CONSTRAINT "content_recommendations_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_actions" DROP CONSTRAINT "crm_actions_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_call_links" DROP CONSTRAINT "crm_call_links_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" DROP CONSTRAINT "crm_call_match_suggestions_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_imports" DROP CONSTRAINT "crm_imports_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_imports" DROP CONSTRAINT "crm_imports_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_lead_events" DROP CONSTRAINT "crm_lead_events_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_lead_profiles" DROP CONSTRAINT "crm_lead_profiles_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" DROP CONSTRAINT "crm_lead_stage_history_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" DROP CONSTRAINT "crm_message_ab_test_assignments_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" DROP CONSTRAINT "crm_message_ab_tests_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" DROP CONSTRAINT "crm_message_ab_tests_created_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" DROP CONSTRAINT "crm_responsibility_history_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "data_imports" DROP CONSTRAINT "data_imports_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "diagnostics" DROP CONSTRAINT "diagnostics_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "email_campaigns" DROP CONSTRAINT "email_campaigns_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "funnel_stage_insights" DROP CONSTRAINT "funnel_stage_insights_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "iclosed_connections" DROP CONSTRAINT "iclosed_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "improvement_events" DROP CONSTRAINT "improvement_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "improvement_initiatives" DROP CONSTRAINT "improvement_initiatives_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "initiative_measurements" DROP CONSTRAINT "initiative_measurements_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "initiative_nudges" DROP CONSTRAINT "initiative_nudges_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "initiative_weekly_focus" DROP CONSTRAINT "initiative_weekly_focus_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "insight_records" DROP CONSTRAINT "insight_records_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "instagram_connections" DROP CONSTRAINT "instagram_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "instagram_post_insights" DROP CONSTRAINT "instagram_post_insights_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "journal_notes" DROP CONSTRAINT "journal_notes_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "journey_columns" DROP CONSTRAINT "journey_columns_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "lead_comments" DROP CONSTRAINT "lead_comments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "leads" DROP CONSTRAINT "leads_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "lever_starter_progress" DROP CONSTRAINT "lever_starter_progress_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" DROP CONSTRAINT "meta_ad_accounts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_action_logs" DROP CONSTRAINT "meta_ad_action_logs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" DROP CONSTRAINT "meta_ad_metric_corrections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_metrics_daily" DROP CONSTRAINT "meta_ad_metrics_daily_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_sets" DROP CONSTRAINT "meta_ad_sets_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ad_touchpoints" DROP CONSTRAINT "meta_ad_touchpoints_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ads" DROP CONSTRAINT "meta_ads_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_ads_connections" DROP CONSTRAINT "meta_ads_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" DROP CONSTRAINT "meta_campaign_profiles_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "meta_campaigns" DROP CONSTRAINT "meta_campaigns_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "monthly_metrics" DROP CONSTRAINT "monthly_metrics_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" DROP CONSTRAINT "native_booking_calendar_conflicts_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" DROP CONSTRAINT "native_booking_calendar_conflicts_closer_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" DROP CONSTRAINT "native_booking_calendar_settings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" DROP CONSTRAINT "native_booking_calendar_settings_closer_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_event_closers" DROP CONSTRAINT "native_booking_event_closers_closer_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_events" DROP CONSTRAINT "native_booking_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_leads" DROP CONSTRAINT "native_booking_leads_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_booking_links" DROP CONSTRAINT "native_booking_links_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_bookings" DROP CONSTRAINT "native_bookings_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_calendar_connections" DROP CONSTRAINT "native_calendar_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "native_calendar_connections" DROP CONSTRAINT "native_calendar_connections_closer_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_attributions" DROP CONSTRAINT "referral_attributions_referrer_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_attributions" DROP CONSTRAINT "referral_attributions_referred_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_codes" DROP CONSTRAINT "referral_codes_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_commissions" DROP CONSTRAINT "referral_commissions_referrer_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_commissions" DROP CONSTRAINT "referral_commissions_referred_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_payouts" DROP CONSTRAINT "referral_payouts_referrer_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sales_call_comments" DROP CONSTRAINT "sales_call_comments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "sales_calls" DROP CONSTRAINT "sales_calls_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "scale_score_history" DROP CONSTRAINT "scale_score_history_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "setters" DROP CONSTRAINT "setters_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "setting_kpi_entries" DROP CONSTRAINT "setting_kpi_entries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "shared_agent_usage" DROP CONSTRAINT "shared_agent_usage_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "staff_members" DROP CONSTRAINT "staff_members_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "streaks" DROP CONSTRAINT "streaks_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_connections" DROP CONSTRAINT "stripe_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_insight_runs" DROP CONSTRAINT "stripe_insight_runs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_transaction_refunds" DROP CONSTRAINT "stripe_transaction_refunds_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_transactions" DROP CONSTRAINT "stripe_transactions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" DROP CONSTRAINT "support_ticket_attachments_submitted_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "support_ticket_events" DROP CONSTRAINT "support_ticket_events_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" DROP CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_submitted_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_member_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_invited_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "team_roles" DROP CONSTRAINT "team_roles_account_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "testimonials" DROP CONSTRAINT "testimonials_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "todos" DROP CONSTRAINT "todos_user_id_users_id_fk";
--> statement-breakpoint
-- Older installations used Postgres's default constraint name here.
ALTER TABLE "video_attributions" DROP CONSTRAINT IF EXISTS "video_attributions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "video_attributions" DROP CONSTRAINT IF EXISTS "video_attributions_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "weekly_reports" DROP CONSTRAINT "weekly_reports_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "winning_patterns" DROP CONSTRAINT "winning_patterns_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_card_metrics" DROP CONSTRAINT "youtube_card_metrics_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_connections" DROP CONSTRAINT "youtube_connections_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_end_screen_metrics" DROP CONSTRAINT "youtube_end_screen_metrics_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_reporting_jobs" DROP CONSTRAINT "youtube_reporting_jobs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_reporting_reports" DROP CONSTRAINT "youtube_reporting_reports_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_video_insights" DROP CONSTRAINT "youtube_video_insights_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "youtube_video_snapshots" DROP CONSTRAINT "youtube_video_snapshots_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "native_booking_calendar_settings_closer_idx";
--> statement-breakpoint
DROP INDEX "native_calendar_connections_closer_provider_subject_idx";
--> statement-breakpoint
ALTER TABLE "agent_token_usage" ADD CONSTRAINT "agent_token_usage_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_token_usage" ADD CONSTRAINT "agent_token_usage_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_token_usage_business_created_idx" ON "agent_token_usage" USING btree ("business_id","created_at");
--> statement-breakpoint
CREATE INDEX "businesses_owner_idx" ON "businesses" USING btree ("owner_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "businesses_booking_handle_idx" ON "businesses" USING btree ("booking_handle") WHERE booking_handle is not null;
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_chat_messages" ADD CONSTRAINT "agent_chat_messages_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "booking_page_settings" ADD CONSTRAINT "booking_page_settings_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_levers" ADD CONSTRAINT "business_levers_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_profile" ADD CONSTRAINT "business_profile_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendly_connections" ADD CONSTRAINT "calendly_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_journey_stage_history" ADD CONSTRAINT "client_journey_stage_history_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_journeys" ADD CONSTRAINT "client_journeys_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_milestones" ADD CONSTRAINT "client_milestones_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_reminders" ADD CONSTRAINT "client_reminders_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "closing_kpi_entries" ADD CONSTRAINT "closing_kpi_entries_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "closing_videos" ADD CONSTRAINT "closing_videos_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_posts" ADD CONSTRAINT "content_posts_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_recommendations" ADD CONSTRAINT "content_recommendations_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_actions" ADD CONSTRAINT "crm_actions_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_call_links" ADD CONSTRAINT "crm_call_links_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_call_match_suggestions" ADD CONSTRAINT "crm_call_match_suggestions_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_imports" ADD CONSTRAINT "crm_imports_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_imports" ADD CONSTRAINT "crm_imports_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_lead_events" ADD CONSTRAINT "crm_lead_events_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_lead_profiles" ADD CONSTRAINT "crm_lead_profiles_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_message_ab_test_assignments" ADD CONSTRAINT "crm_message_ab_test_assignments_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" ADD CONSTRAINT "crm_message_ab_tests_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_message_ab_tests" ADD CONSTRAINT "crm_message_ab_tests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "crm_responsibility_history" ADD CONSTRAINT "crm_responsibility_history_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "data_imports" ADD CONSTRAINT "data_imports_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "diagnostics" ADD CONSTRAINT "diagnostics_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "funnel_stage_insights" ADD CONSTRAINT "funnel_stage_insights_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "iclosed_connections" ADD CONSTRAINT "iclosed_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "improvement_events" ADD CONSTRAINT "improvement_events_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "improvement_initiatives" ADD CONSTRAINT "improvement_initiatives_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "initiative_measurements" ADD CONSTRAINT "initiative_measurements_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "initiative_nudges" ADD CONSTRAINT "initiative_nudges_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "initiative_weekly_focus" ADD CONSTRAINT "initiative_weekly_focus_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "insight_records" ADD CONSTRAINT "insight_records_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "instagram_post_insights" ADD CONSTRAINT "instagram_post_insights_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_notes" ADD CONSTRAINT "journal_notes_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journey_columns" ADD CONSTRAINT "journey_columns_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lead_comments" ADD CONSTRAINT "lead_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lever_starter_progress" ADD CONSTRAINT "lever_starter_progress_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_accounts" ADD CONSTRAINT "meta_ad_accounts_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_action_logs" ADD CONSTRAINT "meta_ad_action_logs_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_metric_corrections" ADD CONSTRAINT "meta_ad_metric_corrections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_metrics_daily" ADD CONSTRAINT "meta_ad_metrics_daily_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_sets" ADD CONSTRAINT "meta_ad_sets_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ad_touchpoints" ADD CONSTRAINT "meta_ad_touchpoints_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ads" ADD CONSTRAINT "meta_ads_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_ads_connections" ADD CONSTRAINT "meta_ads_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_campaign_profiles" ADD CONSTRAINT "meta_campaign_profiles_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meta_campaigns" ADD CONSTRAINT "meta_campaigns_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "monthly_metrics" ADD CONSTRAINT "monthly_metrics_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ADD CONSTRAINT "native_booking_calendar_conflicts_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_conflicts" ADD CONSTRAINT "native_booking_calendar_conflicts_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ADD CONSTRAINT "native_booking_calendar_settings_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_calendar_settings" ADD CONSTRAINT "native_booking_calendar_settings_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_event_closers" ADD CONSTRAINT "native_booking_event_closers_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_events" ADD CONSTRAINT "native_booking_events_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_leads" ADD CONSTRAINT "native_booking_leads_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_booking_links" ADD CONSTRAINT "native_booking_links_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_bookings" ADD CONSTRAINT "native_bookings_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_calendar_connections" ADD CONSTRAINT "native_calendar_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "native_calendar_connections" ADD CONSTRAINT "native_calendar_connections_closer_user_id_users_id_fk" FOREIGN KEY ("closer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referrer_account_id_businesses_id_fk" FOREIGN KEY ("referrer_account_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referred_account_id_businesses_id_fk" FOREIGN KEY ("referred_account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_account_id_businesses_id_fk" FOREIGN KEY ("referrer_account_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referred_account_id_businesses_id_fk" FOREIGN KEY ("referred_account_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "referral_payouts" ADD CONSTRAINT "referral_payouts_referrer_account_id_businesses_id_fk" FOREIGN KEY ("referrer_account_id") REFERENCES "public"."businesses"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_call_comments" ADD CONSTRAINT "sales_call_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sales_calls" ADD CONSTRAINT "sales_calls_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scale_score_history" ADD CONSTRAINT "scale_score_history_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "setters" ADD CONSTRAINT "setters_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "setting_kpi_entries" ADD CONSTRAINT "setting_kpi_entries_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shared_agent_usage" ADD CONSTRAINT "shared_agent_usage_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_connections" ADD CONSTRAINT "stripe_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_insight_runs" ADD CONSTRAINT "stripe_insight_runs_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_transaction_refunds" ADD CONSTRAINT "stripe_transaction_refunds_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "stripe_transactions" ADD CONSTRAINT "stripe_transactions_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "team_roles" ADD CONSTRAINT "team_roles_account_id_businesses_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "video_attributions" ADD CONSTRAINT "video_attributions_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "winning_patterns" ADD CONSTRAINT "winning_patterns_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_card_metrics" ADD CONSTRAINT "youtube_card_metrics_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_connections" ADD CONSTRAINT "youtube_connections_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_end_screen_metrics" ADD CONSTRAINT "youtube_end_screen_metrics_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_reporting_jobs" ADD CONSTRAINT "youtube_reporting_jobs_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_reporting_reports" ADD CONSTRAINT "youtube_reporting_reports_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_video_insights" ADD CONSTRAINT "youtube_video_insights_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "youtube_video_snapshots" ADD CONSTRAINT "youtube_video_snapshots_user_id_businesses_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "native_booking_calendar_settings_closer_idx" ON "native_booking_calendar_settings" USING btree ("user_id","closer_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "native_calendar_connections_closer_provider_subject_idx" ON "native_calendar_connections" USING btree ("user_id","closer_user_id","provider","provider_account_subject");
--> statement-breakpoint
CREATE POLICY "agent_token_usage_account_read" ON "agent_token_usage" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.native_booking_account_member("agent_token_usage"."business_id"));
--> statement-breakpoint
CREATE POLICY "businesses_owner_or_member_read" ON "businesses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.business_identity_member("businesses"."id"));
--> statement-breakpoint
ALTER POLICY "native_booking_calendar_conflicts_account_access" ON "native_booking_calendar_conflicts" TO authenticated USING (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and (public.business_owner("native_booking_calendar_conflicts"."user_id") or "native_booking_calendar_conflicts"."closer_user_id" = auth.uid()) and ("native_booking_calendar_conflicts"."connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_conflicts"."connection_id"
      and connection.user_id = "native_booking_calendar_conflicts"."user_id"
      and connection.closer_user_id = "native_booking_calendar_conflicts"."closer_user_id"
  ))) WITH CHECK (public.native_booking_account_member("native_booking_calendar_conflicts"."user_id") and (public.business_owner("native_booking_calendar_conflicts"."user_id") or "native_booking_calendar_conflicts"."closer_user_id" = auth.uid()) and ("native_booking_calendar_conflicts"."connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_conflicts"."connection_id"
      and connection.user_id = "native_booking_calendar_conflicts"."user_id"
      and connection.closer_user_id = "native_booking_calendar_conflicts"."closer_user_id"
  )));
--> statement-breakpoint
ALTER POLICY "native_booking_calendar_settings_account_access" ON "native_booking_calendar_settings" TO authenticated USING (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and (public.business_owner("native_booking_calendar_settings"."user_id") or "native_booking_calendar_settings"."closer_user_id" = auth.uid()) and ("native_booking_calendar_settings"."invitation_connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_settings"."invitation_connection_id"
      and connection.user_id = "native_booking_calendar_settings"."user_id"
      and connection.closer_user_id = "native_booking_calendar_settings"."closer_user_id"
  ))) WITH CHECK (public.native_booking_account_member("native_booking_calendar_settings"."user_id") and (public.business_owner("native_booking_calendar_settings"."user_id") or "native_booking_calendar_settings"."closer_user_id" = auth.uid()) and ("native_booking_calendar_settings"."invitation_connection_id" is null or exists (
    select 1 from public.native_calendar_connections as connection
    where connection.id = "native_booking_calendar_settings"."invitation_connection_id"
      and connection.user_id = "native_booking_calendar_settings"."user_id"
      and connection.closer_user_id = "native_booking_calendar_settings"."closer_user_id"
  )));
--> statement-breakpoint
ALTER POLICY "native_booking_event_closers_event_access" ON "native_booking_event_closers" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_event_closers"."event_id"
      and public.native_booking_event_viewer(event.id)
      and (public.business_owner(event.user_id) or "native_booking_event_closers"."closer_user_id" = auth.uid())
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_booking_event_closers"."event_id"
      and public.native_booking_event_viewer(event.id)
      and (public.business_owner(event.user_id) or "native_booking_event_closers"."closer_user_id" = auth.uid())
  ));
--> statement-breakpoint
ALTER POLICY "native_bookings_account_access" ON "native_bookings" TO authenticated USING (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_bookings"."event_id"
      and event.user_id = "native_bookings"."user_id"
      and public.native_booking_event_viewer(event.id)
      and (public.business_owner(event.user_id) or "native_bookings"."closer_user_id" = auth.uid())
  )) WITH CHECK (exists (
    select 1 from public.native_booking_events as event
    where event.id = "native_bookings"."event_id"
      and event.user_id = "native_bookings"."user_id"
      and public.native_booking_event_viewer(event.id)
      and (public.business_owner(event.user_id) or "native_bookings"."closer_user_id" = auth.uid())
  ));
--> statement-breakpoint
ALTER POLICY "native_calendar_connections_account_access" ON "native_calendar_connections" TO authenticated USING (public.native_booking_account_member("native_calendar_connections"."user_id") and (public.business_owner("native_calendar_connections"."user_id") or "native_calendar_connections"."closer_user_id" = auth.uid())) WITH CHECK (public.native_booking_account_member("native_calendar_connections"."user_id") and (public.business_owner("native_calendar_connections"."user_id") or "native_calendar_connections"."closer_user_id" = auth.uid()));
--> statement-breakpoint
ALTER POLICY "support_ticket_messages_read" ON "support_ticket_messages" TO authenticated USING ((
        ("support_ticket_messages"."visibility" = 'public' and exists (
          select 1 from public.support_tickets as ticket
          where ticket.id = "support_ticket_messages"."ticket_id"
            and (public.business_owner(ticket.account_id) or ticket.submitted_by_user_id = (select auth.uid()))
        ))
        or exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)
      ));
--> statement-breakpoint
ALTER POLICY "support_tickets_read" ON "support_tickets" TO authenticated USING ((
        public.business_owner(account_id)
        or submitted_by_user_id = (select auth.uid())
        or exists (
  select 1
  from public.staff_members as support_staff
  where support_staff.user_id = (select auth.uid())
    and support_staff.status = 'active'
)
      ));
--> statement-breakpoint
-- Compatibility writers only synchronize the unambiguous legacy identity.
-- Remove these triggers/legacy columns only after old writers have drained.
CREATE OR REPLACE FUNCTION public.sync_legacy_business_configuration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='users' THEN
  UPDATE public.businesses SET "anthropic_api_key_encrypted"=NEW."anthropic_api_key_encrypted", "anthropic_api_key_invalid"=NEW."anthropic_api_key_invalid", "stripe_connect_id"=NEW."stripe_connect_id", "stripe_customer_id"=NEW."stripe_customer_id", "iclosed_connected"=NEW."iclosed_connected", "calendly_connected"=NEW."calendly_connected", "instagram_connected"=NEW."instagram_connected", "youtube_connected"=NEW."youtube_connected", "meta_ads_connected"=NEW."meta_ads_connected", "sector"=NEW."sector", "onboarding_completed"=NEW."onboarding_completed", "business_profile_completed_at"=NEW."business_profile_completed_at", "weekly_email_enabled"=NEW."weekly_email_enabled", "is_test_account"=NEW."is_test_account", "last_improve_metric_key"=NEW."last_improve_metric_key", "last_improve_metric_rate_snapshot"=NEW."last_improve_metric_rate_snapshot", "last_weekly_brief_sent_at"=NEW."last_weekly_brief_sent_at", "advanced_modules_enabled"=NEW."advanced_modules_enabled", "crm_enabled"=NEW."crm_enabled", "booking_handle"=NEW."booking_handle" WHERE id=NEW.id AND owner_user_id=NEW.id;
 ELSIF NEW.id=NEW.owner_user_id THEN
  UPDATE public.users SET "anthropic_api_key_encrypted"=NEW."anthropic_api_key_encrypted", "anthropic_api_key_invalid"=NEW."anthropic_api_key_invalid", "stripe_connect_id"=NEW."stripe_connect_id", "stripe_customer_id"=NEW."stripe_customer_id", "iclosed_connected"=NEW."iclosed_connected", "calendly_connected"=NEW."calendly_connected", "instagram_connected"=NEW."instagram_connected", "youtube_connected"=NEW."youtube_connected", "meta_ads_connected"=NEW."meta_ads_connected", "sector"=NEW."sector", "onboarding_completed"=NEW."onboarding_completed", "business_profile_completed_at"=NEW."business_profile_completed_at", "weekly_email_enabled"=NEW."weekly_email_enabled", "is_test_account"=NEW."is_test_account", "last_improve_metric_key"=NEW."last_improve_metric_key", "last_improve_metric_rate_snapshot"=NEW."last_improve_metric_rate_snapshot", "last_weekly_brief_sent_at"=NEW."last_weekly_brief_sent_at", "advanced_modules_enabled"=NEW."advanced_modules_enabled", "crm_enabled"=NEW."crm_enabled", "booking_handle"=NEW."booking_handle" WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END; $f$;
REVOKE ALL ON FUNCTION public.sync_legacy_business_configuration() FROM PUBLIC;
CREATE TRIGGER users_legacy_business_configuration AFTER UPDATE OF "anthropic_api_key_encrypted", "anthropic_api_key_invalid", "stripe_connect_id", "stripe_customer_id", "iclosed_connected", "calendly_connected", "instagram_connected", "youtube_connected", "meta_ads_connected", "sector", "onboarding_completed", "business_profile_completed_at", "weekly_email_enabled", "is_test_account", "last_improve_metric_key", "last_improve_metric_rate_snapshot", "last_weekly_brief_sent_at", "advanced_modules_enabled", "crm_enabled", "booking_handle" ON public.users
 FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_business_configuration();
CREATE TRIGGER businesses_legacy_configuration AFTER UPDATE OF "anthropic_api_key_encrypted", "anthropic_api_key_invalid", "stripe_connect_id", "stripe_customer_id", "iclosed_connected", "calendly_connected", "instagram_connected", "youtube_connected", "meta_ads_connected", "sector", "onboarding_completed", "business_profile_completed_at", "weekly_email_enabled", "is_test_account", "last_improve_metric_key", "last_improve_metric_rate_snapshot", "last_weekly_brief_sent_at", "advanced_modules_enabled", "crm_enabled", "booking_handle" ON public.businesses
 FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_business_configuration();
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."activity_log" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."activity_log" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."activity_log" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."activity_log" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."ad_campaigns" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."ad_campaigns" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."ad_campaigns" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."ad_campaigns" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."agent_chat_messages" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."agent_chat_messages" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."agent_chat_messages" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."agent_chat_messages" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."agent_token_usage" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("business_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("business_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."agent_token_usage" FOR ALL TO authenticated USING (public.business_owner("business_id") AND public.business_billing_active("business_id")) WITH CHECK (public.business_owner("business_id") AND public.business_billing_active("business_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."agent_token_usage" FOR SELECT TO authenticated USING (public.business_permission_member("business_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."agent_token_usage" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."booking_page_settings" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."booking_page_settings" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."booking_page_settings" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."booking_page_settings" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."business_levers" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."business_levers" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."business_levers" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."business_levers" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."business_profile" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['business']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['business']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."business_profile" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."business_profile" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['business']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."business_profile" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."calendly_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."calendly_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."calendly_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."calendly_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."client_journey_stage_history" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."client_journey_stage_history" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."client_journey_stage_history" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."client_journey_stage_history" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."client_journeys" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."client_journeys" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."client_journeys" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."client_journeys" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."client_milestones" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."client_milestones" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."client_milestones" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."client_milestones" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."client_notes" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."client_notes" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."client_notes" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."client_notes" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."client_reminders" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."client_reminders" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."client_reminders" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."client_reminders" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."closing_kpi_entries" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."closing_kpi_entries" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."closing_kpi_entries" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."closing_kpi_entries" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."closing_videos" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."closing_videos" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."closing_videos" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."closing_videos" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."content_posts" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."content_posts" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."content_posts" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."content_posts" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."content_recommendations" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."content_recommendations" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."content_recommendations" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."content_recommendations" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."conversations" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."conversations" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."conversations" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."conversations" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_actions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_actions" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_actions" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_actions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_call_links" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_call_links" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_call_links" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_call_links" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_call_match_suggestions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_call_match_suggestions" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_call_match_suggestions" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_call_match_suggestions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_imports" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_imports" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_imports" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_imports" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_lead_events" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_lead_events" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_lead_events" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_lead_events" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_lead_profiles" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_lead_profiles" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_lead_profiles" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_lead_profiles" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_lead_stage_history" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_lead_stage_history" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_lead_stage_history" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_lead_stage_history" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_message_ab_test_assignments" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_message_ab_test_assignments" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_message_ab_test_assignments" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_message_ab_test_assignments" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_message_ab_tests" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_message_ab_tests" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_message_ab_tests" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_message_ab_tests" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."crm_responsibility_history" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."crm_responsibility_history" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."crm_responsibility_history" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."crm_responsibility_history" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."data_imports" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."data_imports" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."data_imports" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."data_imports" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."diagnostics" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."diagnostics" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."diagnostics" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."diagnostics" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."email_campaigns" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:mail']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:mail']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."email_campaigns" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."email_campaigns" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:mail']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."email_campaigns" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."funnel_stage_insights" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."funnel_stage_insights" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."funnel_stage_insights" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."funnel_stage_insights" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."iclosed_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."iclosed_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."iclosed_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."iclosed_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."improvement_events" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."improvement_events" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."improvement_events" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."improvement_events" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."improvement_initiatives" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."improvement_initiatives" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."improvement_initiatives" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."improvement_initiatives" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."initiative_measurements" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."initiative_measurements" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."initiative_measurements" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."initiative_measurements" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."initiative_nudges" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."initiative_nudges" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."initiative_nudges" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."initiative_nudges" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."initiative_weekly_focus" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."initiative_weekly_focus" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."initiative_weekly_focus" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."initiative_weekly_focus" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."insight_records" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."insight_records" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."insight_records" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."insight_records" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."instagram_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."instagram_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."instagram_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."instagram_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."instagram_post_insights" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."instagram_post_insights" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."instagram_post_insights" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."instagram_post_insights" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."journal_notes" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."journal_notes" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."journal_notes" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."journal_notes" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."journey_columns" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."journey_columns" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."journey_columns" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:suivi-client']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."journey_columns" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."leads" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]) AND "account_id"="user_id") WITH CHECK (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]) AND "account_id"="user_id");
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."leads" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."leads" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."leads" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."lever_starter_progress" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."lever_starter_progress" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."lever_starter_progress" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."lever_starter_progress" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_accounts" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_accounts" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_accounts" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_accounts" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_action_logs" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_action_logs" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_action_logs" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_action_logs" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_metric_corrections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_metric_corrections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_metric_corrections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_metric_corrections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_metrics_daily" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_metrics_daily" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_metrics_daily" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_metrics_daily" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_sets" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_sets" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_sets" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_sets" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ad_touchpoints" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ad_touchpoints" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ad_touchpoints" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ad_touchpoints" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ads" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ads" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ads" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ads" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_ads_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_ads_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_ads_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_ads_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_campaign_profiles" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_campaign_profiles" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_campaign_profiles" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_campaign_profiles" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."meta_campaigns" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."meta_campaigns" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."meta_campaigns" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:ads']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."meta_campaigns" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."monthly_metrics" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."monthly_metrics" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."monthly_metrics" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."monthly_metrics" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_booking_calendar_conflicts" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_booking_calendar_conflicts" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_booking_calendar_conflicts" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_booking_calendar_conflicts" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_booking_calendar_settings" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_booking_calendar_settings" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_booking_calendar_settings" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_booking_calendar_settings" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_booking_events" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_booking_events" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_booking_events" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_booking_events" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_booking_leads" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_booking_leads" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_booking_leads" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_booking_leads" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_booking_links" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_booking_links" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_booking_links" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_booking_links" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_bookings" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_bookings" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_bookings" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_bookings" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."native_calendar_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."native_calendar_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."native_calendar_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:rdv']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."native_calendar_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."projects" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."projects" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."projects" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."projects" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."referral_attributions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]) AND "referred_account_id"="referrer_account_id") WITH CHECK (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]) AND "referred_account_id"="referrer_account_id");
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."referral_attributions" FOR ALL TO authenticated USING (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id")) WITH CHECK (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."referral_attributions" FOR SELECT TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."referral_attributions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."referral_codes" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."referral_codes" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."referral_codes" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."referral_codes" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."referral_commissions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]) AND "referred_account_id"="referrer_account_id") WITH CHECK (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]) AND "referred_account_id"="referrer_account_id");
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."referral_commissions" FOR ALL TO authenticated USING (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id")) WITH CHECK (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."referral_commissions" FOR SELECT TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."referral_commissions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."referral_payouts" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."referral_payouts" FOR ALL TO authenticated USING (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id")) WITH CHECK (public.business_owner("referrer_account_id") AND public.business_billing_active("referrer_account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."referral_payouts" FOR SELECT TO authenticated USING (public.business_permission_member("referrer_account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."referral_payouts" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."sales" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:suivi','crm:validate-sale']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:suivi','crm:validate-sale']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."sales" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."sales" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:suivi','crm:validate-sale']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."sales" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."sales_calls" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."sales_calls" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."sales_calls" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['ventes:appels','ventes:videos']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."sales_calls" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."scale_score_history" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."scale_score_history" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."scale_score_history" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."scale_score_history" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."setters" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."setters" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."setters" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."setters" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."setting_kpi_entries" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."setting_kpi_entries" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."setting_kpi_entries" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['crm:view','acquisition:pipeline','acquisition:setting']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."setting_kpi_entries" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."shared_agent_usage" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."shared_agent_usage" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."shared_agent_usage" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."shared_agent_usage" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."streaks" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."streaks" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."streaks" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."streaks" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."stripe_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."stripe_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."stripe_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stripe_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."stripe_insight_runs" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."stripe_insight_runs" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."stripe_insight_runs" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stripe_insight_runs" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."stripe_transaction_refunds" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."stripe_transaction_refunds" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."stripe_transaction_refunds" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stripe_transaction_refunds" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."stripe_transactions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."stripe_transactions" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."stripe_transactions" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."stripe_transactions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."subscriptions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_owner("user_id")) WITH CHECK (public.business_owner("user_id"));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."subscriptions" FOR ALL TO authenticated USING (public.business_owner("user_id")) WITH CHECK (public.business_owner("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."subscriptions" FOR SELECT TO authenticated USING (public.business_owner("user_id"));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."subscriptions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."support_tickets" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."support_tickets" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."support_tickets" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."support_tickets" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."team_members" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."team_members" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."team_members" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."team_members" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."team_roles" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[])) WITH CHECK (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."team_roles" FOR ALL TO authenticated USING (public.business_owner("account_id") AND public.business_billing_active("account_id")) WITH CHECK (public.business_owner("account_id") AND public.business_billing_active("account_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."team_roles" FOR SELECT TO authenticated USING (public.business_permission_member("account_id",ARRAY['__owner__']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."team_roles" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."testimonials" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:temoignages']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['delivrabilite:temoignages']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."testimonials" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."testimonials" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['delivrabilite:temoignages']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."testimonials" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."todos" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."todos" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."todos" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."todos" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."video_attributions" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."video_attributions" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."video_attributions" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."video_attributions" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."weekly_reports" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."weekly_reports" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."weekly_reports" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY[]::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."weekly_reports" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."winning_patterns" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."winning_patterns" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."winning_patterns" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."winning_patterns" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_card_metrics" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_card_metrics" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_card_metrics" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_card_metrics" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_connections" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_connections" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_connections" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_connections" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_end_screen_metrics" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_end_screen_metrics" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_end_screen_metrics" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_end_screen_metrics" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_reporting_jobs" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_reporting_jobs" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_reporting_jobs" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_reporting_jobs" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_reporting_reports" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_reporting_reports" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_reporting_reports" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_reporting_reports" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_video_insights" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_video_insights" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_video_insights" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_video_insights" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_scope_gate ON public."youtube_video_snapshots" AS RESTRICTIVE FOR ALL TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[])) WITH CHECK (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
CREATE POLICY business_owner_access ON public."youtube_video_snapshots" FOR ALL TO authenticated USING (public.business_owner("user_id") AND public.business_billing_active("user_id")) WITH CHECK (public.business_owner("user_id") AND public.business_billing_active("user_id"));
--> statement-breakpoint
CREATE POLICY business_member_read ON public."youtube_video_snapshots" FOR SELECT TO authenticated USING (public.business_permission_member("user_id",ARRAY['acquisition:contenu']::text[]));
--> statement-breakpoint
GRANT SELECT,INSERT,UPDATE,DELETE ON public."youtube_video_snapshots" TO authenticated;
--> statement-breakpoint
CREATE POLICY business_role_join_access ON public.team_member_roles FOR ALL TO authenticated
USING (EXISTS(SELECT 1 FROM public.team_members m WHERE m.id=team_member_id AND public.business_owner(m.account_id) AND public.business_billing_active(m.account_id)))
WITH CHECK (EXISTS(SELECT 1 FROM public.team_members m JOIN public.team_roles r ON r.account_id=m.account_id WHERE m.id=team_member_id AND r.id=role_id AND public.business_owner(m.account_id) AND public.business_billing_active(m.account_id)));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.team_member_roles TO authenticated;
REVOKE ALL ON public.businesses,public.platform_admin_emails,public.users FROM anon,authenticated;
GRANT SELECT(id,owner_user_id,name,status,is_initial,created_at) ON public.businesses TO authenticated;
GRANT SELECT(id,email,created_at,display_name,avatar_url,locale,reduce_falco_animations,theme_preference,support_last_seen_at) ON public.users TO authenticated;
GRANT UPDATE(display_name,avatar_url,locale,reduce_falco_animations,theme_preference,support_last_seen_at) ON public.users TO authenticated;
CREATE POLICY users_personal_access ON public.users FOR ALL TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
--> statement-breakpoint
REVOKE ALL ON public."calendly_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."iclosed_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."instagram_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."meta_ads_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."native_calendar_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."stripe_connections" FROM anon,authenticated;
--> statement-breakpoint
REVOKE ALL ON public."youtube_connections" FROM anon,authenticated;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.enforce_business_references() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $f$
DECLARE cfg jsonb:=TG_ARGV[0]::jsonb; scope_value text; candidate text; item jsonb; key text; foreign_value text;
BEGIN
 FOR key IN SELECT jsonb_array_elements_text(cfg->'scope') LOOP
  candidate:=to_jsonb(NEW)->>key;
  IF TG_OP='UPDATE' AND (to_jsonb(OLD)->>key) IS DISTINCT FROM candidate THEN RAISE EXCEPTION 'Business ownership cannot be reassigned' USING ERRCODE='23514'; END IF;
  IF scope_value IS NOT NULL AND candidate IS DISTINCT FROM scope_value THEN RAISE EXCEPTION 'Business references must belong to one business' USING ERRCODE='23514'; END IF;
  scope_value:=coalesce(scope_value,candidate);
 END LOOP;
 FOR item IN SELECT jsonb_array_elements(cfg->'parents') LOOP
  foreign_value:=to_jsonb(NEW)->>(item->>'column');
  IF foreign_value IS NULL THEN CONTINUE; END IF;
  EXECUTE format('SELECT %I::text FROM public.%I WHERE %I=$1::uuid',item->>'scope',item->>'table',item->>'target') INTO candidate USING foreign_value;
  IF candidate IS NULL THEN CONTINUE; END IF;
  IF scope_value IS NOT NULL AND candidate IS DISTINCT FROM scope_value THEN RAISE EXCEPTION 'Business references must belong to one business' USING ERRCODE='23514'; END IF;
  scope_value:=coalesce(scope_value,candidate);
 END LOOP;
 RETURN NEW;
END; $f$;
REVOKE ALL ON FUNCTION public.enforce_business_references() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."agent_chat_messages" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"conversation_id","table":"conversations","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."client_journey_stage_history" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"client_journey_id","table":"client_journeys","target":"id","scope":"user_id"},{"column":"from_column_id","table":"journey_columns","target":"id","scope":"user_id"},{"column":"to_column_id","table":"journey_columns","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."client_journeys" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"sale_id","table":"sales","target":"id","scope":"user_id"},{"column":"column_id","table":"journey_columns","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."client_milestones" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"client_journey_id","table":"client_journeys","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."client_notes" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"client_journey_id","table":"client_journeys","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."client_reminders" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"client_journey_id","table":"client_journeys","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."closing_videos" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"sales_call_id","table":"sales_calls","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_actions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_call_links" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"},{"column":"sales_call_id","table":"sales_calls","target":"id","scope":"user_id"},{"column":"accepted_suggestion_id","table":"crm_call_match_suggestions","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_call_match_candidates" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"suggestion_id","table":"crm_call_match_suggestions","target":"id","scope":"account_id"},{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_call_match_suggestions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"sales_call_id","table":"sales_calls","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_lead_events" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_lead_profiles" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_lead_stage_history" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"},{"column":"responsible_setter_id","table":"setters","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_message_ab_test_assignments" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"test_id","table":"crm_message_ab_tests","target":"id","scope":"account_id"},{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."crm_responsibility_history" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"},{"column":"previous_setter_id","table":"setters","target":"id","scope":"user_id"},{"column":"next_setter_id","table":"setters","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."improvement_initiatives" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"insight_record_id","table":"insight_records","target":"id","scope":"user_id"},{"column":"assigned_team_member_id","table":"team_members","target":"id","scope":"account_id"},{"column":"todo_id","table":"todos","target":"id","scope":"user_id"},{"column":"project_id","table":"projects","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."initiative_measurements" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"initiative_id","table":"improvement_initiatives","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."initiative_nudges" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"initiative_id","table":"improvement_initiatives","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."initiative_weekly_focus" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"initiative_id","table":"improvement_initiatives","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."lead_comments" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."lead_stage_history" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."leads" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id","account_id"],"parents":[{"column":"meta_touchpoint_id","table":"meta_ad_touchpoints","target":"id","scope":"user_id"},{"column":"setter_id","table":"setters","target":"id","scope":"user_id"},{"column":"sale_id","table":"sales","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ad_accounts" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"connection_id","table":"meta_ads_connections","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ad_action_logs" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ad_metric_corrections" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"},{"column":"metric_row_id","table":"meta_ad_metrics_daily","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ad_metrics_daily" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ad_sets" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"},{"column":"campaign_id","table":"meta_campaigns","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_ads" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"},{"column":"ad_set_id","table":"meta_ad_sets","target":"id","scope":"user_id"},{"column":"campaign_id","table":"meta_campaigns","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_campaign_profiles" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"campaign_id","table":"meta_campaigns","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."meta_campaigns" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"ad_account_id","table":"meta_ad_accounts","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_activities" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"booking_id","table":"native_bookings","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_availability" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_calendar_conflicts" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"connection_id","table":"native_calendar_connections","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_calendar_settings" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"invitation_connection_id","table":"native_calendar_connections","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_event_closers" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_exceptions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_leads" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"},{"column":"link_id","table":"native_booking_links","target":"id","scope":"user_id"},{"column":"meta_touchpoint_id","table":"meta_ad_touchpoints","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_links" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_notifications" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"booking_id","table":"native_bookings","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_questions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_reminder_deliveries" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"booking_id","table":"native_bookings","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_booking_reminder_rules" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."native_bookings" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"event_id","table":"native_booking_events","target":"id","scope":"user_id"},{"column":"abandoned_lead_id","table":"native_booking_leads","target":"id","scope":"user_id"},{"column":"calendar_connection_id","table":"native_calendar_connections","target":"id","scope":"user_id"},{"column":"link_id","table":"native_booking_links","target":"id","scope":"user_id"},{"column":"meta_touchpoint_id","table":"meta_ad_touchpoints","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."referral_attributions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["referrer_account_id","referred_account_id"],"parents":[{"column":"referral_code_id","table":"referral_codes","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."referral_commissions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["referrer_account_id","referred_account_id"],"parents":[{"column":"attribution_id","table":"referral_attributions","target":"id","scope":"referrer_account_id"},{"column":"payout_id","table":"referral_payouts","target":"id","scope":"referrer_account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."sales" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"meta_touchpoint_id","table":"meta_ad_touchpoints","target":"id","scope":"user_id"},{"column":"setter_id","table":"setters","target":"id","scope":"user_id"},{"column":"lead_id","table":"leads","target":"id","scope":"user_id"},{"column":"parent_sale_id","table":"sales","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."sales_call_comments" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"call_id","table":"sales_calls","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."sales_calls" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"setter_id","table":"setters","target":"id","scope":"user_id"},{"column":"meta_touchpoint_id","table":"meta_ad_touchpoints","target":"id","scope":"user_id"},{"column":"sale_id","table":"sales","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."support_ticket_attachments" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"ticket_id","table":"support_tickets","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."support_ticket_events" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"ticket_id","table":"support_tickets","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."support_ticket_messages" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"ticket_id","table":"support_tickets","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."support_tickets" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["account_id"],"parents":[{"column":"duplicate_of_ticket_id","table":"support_tickets","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."team_member_roles" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":[],"parents":[{"column":"team_member_id","table":"team_members","target":"id","scope":"account_id"},{"column":"role_id","table":"team_roles","target":"id","scope":"account_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."testimonials" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"client_journey_id","table":"client_journeys","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."todos" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"project_id","table":"projects","target":"id","scope":"user_id"}]}');
--> statement-breakpoint
CREATE TRIGGER enforce_business_references BEFORE INSERT OR UPDATE ON public."video_attributions" FOR EACH ROW EXECUTE FUNCTION public.enforce_business_references('{"scope":["user_id"],"parents":[{"column":"sale_id","table":"sales","target":"id","scope":"user_id"},{"column":"lead_id","table":"leads","target":"id","scope":"user_id"}]}');
