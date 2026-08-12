CREATE TABLE "funnel_block_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_key" text NOT NULL,
	"benchmark_key" text NOT NULL,
	"sector" "prospection_sector",
	"value" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_block_benchmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "funnel_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_key" text NOT NULL,
	"family" text NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"steps" jsonb NOT NULL,
	"example" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funnel_blocks_block_key_unique" UNIQUE("block_key")
);
--> statement-breakpoint
ALTER TABLE "funnel_blocks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "monthly_metrics" ADD COLUMN "acquisition_source_metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "funnel_block_benchmarks" ADD CONSTRAINT "funnel_block_benchmarks_block_key_funnel_blocks_block_key_fk" FOREIGN KEY ("block_key") REFERENCES "public"."funnel_blocks"("block_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "funnel_block_benchmarks_scope_idx" ON "funnel_block_benchmarks" USING btree ("block_key","benchmark_key","sector");
--> statement-breakpoint
INSERT INTO "funnel_blocks" ("block_key", "family", "label", "description", "steps", "example") VALUES
('organique', 'source', 'Organique', 'Le trafic qui vient de tes contenus et recommandations.', '[]'::jsonb, 'Contenu → capture'),
('ads', 'source', 'Ads', 'Le trafic acheté sur Meta, YouTube ou une autre régie.', '[]'::jsonb, 'Ads → VSL'),
('newsletter', 'source', 'Newsletter', 'Le trafic que tu possèdes déjà dans ta liste email.', '[]'::jsonb, 'Email → offre'),
('bouche_a_oreille', 'source', 'Bouche-à-oreille', 'Les prospects qui arrivent grâce à une recommandation.', '[]'::jsonb, 'Recommandation → appel'),
('communaute_externe', 'source', 'Communauté externe', 'Le trafic qui vient d’une communauté que tu ne possèdes pas.', '[]'::jsonb, 'Communauté → capture'),
('lead_magnet', 'capture', 'Lead magnet', 'Le prospect échange son email contre une ressource gratuite.', $$[{"order":1,"metricKey":"lead_magnet_clicks","label":"Clics","unit":"clics","benchmarkKey":null},{"order":2,"metricKey":"lead_magnet_optins","label":"Opt-ins","unit":"opt-ins","benchmarkKey":"optin_rate"}]$$::jsonb, 'Clics → Opt-ins'),
('vsl', 'capture', 'VSL', 'Le prospect regarde une vidéo de vente avant de continuer.', $$[{"order":1,"metricKey":"vsl_views","label":"Vues","unit":"vues","benchmarkKey":null},{"order":2,"metricKey":"vsl_complete_views","label":"Vues complètes","unit":"vues","benchmarkKey":"complete_view_rate"}]$$::jsonb, 'Vues → Vues complètes'),
('quiz', 'capture', 'Quiz', 'Le prospect répond à un quiz et reçoit un résultat.', $$[{"order":1,"metricKey":"quiz_clicks","label":"Clics","unit":"clics","benchmarkKey":null},{"order":2,"metricKey":"quiz_completed","label":"Quiz complétés","unit":"quiz","benchmarkKey":"completion_rate"}]$$::jsonb, 'Clics → Quiz complétés'),
('page_de_vente', 'capture', 'Page de vente', 'Le prospect découvre ton offre sur une page dédiée.', $$[{"order":1,"metricKey":"sales_page_visitors","label":"Visiteurs","unit":"visiteurs","benchmarkKey":null},{"order":2,"metricKey":"checkouts_started","label":"Checkouts initiés","unit":"checkouts","benchmarkKey":"checkout_rate"}]$$::jsonb, 'Visiteurs → Checkouts'),
('inscription_event', 'capture', 'Inscription événement', 'Le prospect s’inscrit à un webinaire, challenge ou événement.', $$[{"order":1,"metricKey":"event_registrants","label":"Inscrits","unit":"inscrits","benchmarkKey":null}]$$::jsonb, 'Inscrits → événement'),
('aucune_capture', 'capture', 'Aucune capture', 'Le prospect va directement vers la conversion.', '[]'::jsonb, 'Direct → conversion'),
('communaute_freemium', 'nurturing', 'Communauté freemium', 'Le prospect rejoint une communauté puis devient actif.', $$[{"order":1,"metricKey":"community_joined","label":"Membres rejoints","unit":"membres","benchmarkKey":null},{"order":2,"metricKey":"community_active","label":"Membres actifs","unit":"membres","benchmarkKey":"active_rate"}]$$::jsonb, 'Membres rejoints → Membres actifs'),
('sequence_email', 'nurturing', 'Séquence email', 'Une séquence email accompagne le prospect jusqu’à l’offre.', $$[{"order":1,"metricKey":"email_sends","label":"Envois","unit":"emails","benchmarkKey":null},{"order":2,"metricKey":"email_opens","label":"Ouvertures","unit":"ouvertures","benchmarkKey":"open_rate"},{"order":3,"metricKey":"email_clicks","label":"Clics","unit":"clics","benchmarkKey":"click_rate"}]$$::jsonb, 'Envois → Ouvertures → Clics'),
('challenge', 'nurturing', 'Challenge', 'Le prospect participe à un challenge avant de passer à l’action.', $$[{"order":1,"metricKey":"challenge_participants","label":"Participants","unit":"participants","benchmarkKey":null},{"order":2,"metricKey":"challenge_active","label":"Participants actifs","unit":"participants","benchmarkKey":"active_rate"}]$$::jsonb, 'Participants → Participants actifs'),
('webinaire', 'nurturing', 'Webinaire', 'Le prospect assiste à un webinaire avant la conversion.', $$[{"order":1,"metricKey":"webinar_attendees","label":"Présents","unit":"présents","benchmarkKey":null}]$$::jsonb, 'Inscrits → Présents'),
('setting_dm', 'nurturing', 'Setting DM', 'Les échanges en DM qualifient le prospect et proposent un appel.', $$[{"order":1,"metricKey":"first_messages","label":"Premiers messages","unit":"messages","benchmarkKey":null},{"order":2,"metricKey":"conversations","label":"Conversations","unit":"conversations","benchmarkKey":"conversation_rate"},{"order":3,"metricKey":"calls_proposed","label":"Appels proposés","unit":"appels","benchmarkKey":"proposal_rate"}]$$::jsonb, 'Messages → Conversations → Appels proposés'),
('aucune_nurturing', 'nurturing', 'Aucun nurturing', 'Il n’y a pas d’étape intermédiaire avant la vente.', '[]'::jsonb, 'Direct → conversion'),
('appel', 'conversion', 'Appel', 'La vente se fait pendant un appel de closing.', $$[{"order":1,"metricKey":"calls_booked","label":"RDV réservés","unit":"RDV","benchmarkKey":null},{"order":2,"metricKey":"calls_attended","label":"RDV honorés","unit":"RDV","benchmarkKey":"show_up_rate"},{"order":3,"metricKey":"sales_closed","label":"Ventes","unit":"ventes","benchmarkKey":"closing_rate"}]$$::jsonb, 'RDV réservés → RDV honorés → Ventes'),
('checkout_direct', 'conversion', 'Checkout direct', 'Le prospect achète directement depuis un checkout.', $$[{"order":1,"metricKey":"checkouts_started","label":"Checkouts","unit":"checkouts","benchmarkKey":null},{"order":2,"metricKey":"sales_closed","label":"Ventes","unit":"ventes","benchmarkKey":"purchase_rate"}]$$::jsonb, 'Checkouts → Ventes'),
('offre_fin_event', 'conversion', 'Offre en fin d’événement', 'Une offre est présentée à la fin d’un événement.', $$[{"order":1,"metricKey":"offers_presented","label":"Offres présentées","unit":"offres","benchmarkKey":null},{"order":2,"metricKey":"sales_closed","label":"Ventes","unit":"ventes","benchmarkKey":"closing_rate"}]$$::jsonb, 'Offres présentées → Ventes')
ON CONFLICT ("block_key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "funnel_block_benchmarks" ("block_key", "benchmark_key", "value") VALUES
('lead_magnet', 'optin_rate', 0.2),
('vsl', 'complete_view_rate', 0.5),
('quiz', 'completion_rate', 0.5),
('page_de_vente', 'checkout_rate', 0.15),
('communaute_freemium', 'active_rate', 0.5),
('sequence_email', 'open_rate', 0.4),
('sequence_email', 'click_rate', 0.05),
('challenge', 'active_rate', 0.5),
('setting_dm', 'conversation_rate', 0.35),
('setting_dm', 'proposal_rate', 0.5),
('appel', 'show_up_rate', 0.6),
('appel', 'closing_rate', 0.3),
('checkout_direct', 'purchase_rate', 0.3),
('offre_fin_event', 'closing_rate', 0.3)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "business_profile"
SET "acquisition" = "acquisition"
  || jsonb_build_object(
    'blocks', CASE
      WHEN COALESCE("acquisition"->'vsl'->>'enabled', '') = 'yes' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'vsl', 'order', 1),
        jsonb_build_object('blockKey', 'appel', 'order', 2)
      )
      WHEN COALESCE("acquisition"->'setting'->>'enabled', '') = 'yes' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'aucune_capture', 'order', 1),
        jsonb_build_object('blockKey', 'setting_dm', 'order', 2),
        jsonb_build_object('blockKey', 'appel', 'order', 3)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'webinaire' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'inscription_event', 'order', 1),
        jsonb_build_object('blockKey', 'webinaire', 'order', 2),
        jsonb_build_object('blockKey', 'appel', 'order', 3)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'challenge' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'inscription_event', 'order', 1),
        jsonb_build_object('blockKey', 'challenge', 'order', 2),
        jsonb_build_object('blockKey', 'appel', 'order', 3)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'newsletter' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'aucune_capture', 'order', 1),
        jsonb_build_object('blockKey', 'sequence_email', 'order', 2),
        jsonb_build_object('blockKey', 'appel', 'order', 3)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'vente_directe' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'page_de_vente', 'order', 1),
        jsonb_build_object('blockKey', 'checkout_direct', 'order', 2)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'communaute' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'aucune_capture', 'order', 1),
        jsonb_build_object('blockKey', 'communaute_freemium', 'order', 2),
        jsonb_build_object('blockKey', 'appel', 'order', 3)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'appel_direct' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'aucune_capture', 'order', 1),
        jsonb_build_object('blockKey', 'appel', 'order', 2)
      )
      WHEN COALESCE("acquisition"->>'primaryFunnel', 'lead_magnet') = 'quiz' THEN jsonb_build_array(
        jsonb_build_object('blockKey', 'quiz', 'order', 1),
        jsonb_build_object('blockKey', 'appel', 'order', 2)
      )
      ELSE jsonb_build_array(
        jsonb_build_object('blockKey', 'lead_magnet', 'order', 1),
        jsonb_build_object('blockKey', 'appel', 'order', 2)
      )
    END,
    'sources', CASE COALESCE("identity"->>'acquisitionMode', 'organique')
      WHEN 'ads' THEN jsonb_build_array('ads')
      WHEN 'hybride' THEN jsonb_build_array('organique', 'ads')
      ELSE jsonb_build_array('organique')
    END,
    'blockConfigurations', COALESCE("acquisition"->'blockConfigurations', '{}'::jsonb),
    'blockSelectionInferred', true
  )
WHERE NOT ("acquisition" ? 'blocks') OR NOT ("acquisition" ? 'sources');
