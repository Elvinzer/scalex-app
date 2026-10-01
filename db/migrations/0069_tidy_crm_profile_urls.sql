-- Keep legacy profile projections compatible with the canonical URL produced
-- by lib/crm/normalization.ts. Conflicting normalized URLs remain untouched
-- and are recorded for review instead of violating the unique index.
WITH normalized AS (
  SELECT
    p.id,
    regexp_replace(
      regexp_replace(
        regexp_replace(p.canonical_profile_url, '^https?://www[.]', 'https://'),
        '[?#].*$',
        ''
      ),
      '/+$',
      ''
    ) AS normalized_url
  FROM "crm_lead_profiles" p
  WHERE p.canonical_profile_url IS NOT NULL
), conflicts AS (
  SELECT p.account_id, p.platform, n.normalized_url
  FROM "crm_lead_profiles" p
  JOIN normalized n ON n.id = p.id
  GROUP BY p.account_id, p.platform, n.normalized_url
  HAVING count(*) > 1
)
INSERT INTO "crm_lead_events" (
  "account_id", "lead_id", "type", "source", "source_event_key", "captured_at", "metadata"
)
SELECT
  p.account_id,
  p.lead_id,
  'profile_captured',
  'migration',
  'migration:profile-url-normalization-conflict:' || p.id,
  now(),
  jsonb_build_object('operation', 'profile_url_normalization', 'conflict', true, 'canonicalProfileUrl', p.canonical_profile_url)
FROM "crm_lead_profiles" p
JOIN normalized n ON n.id = p.id
JOIN conflicts c ON c.account_id = p.account_id AND c.platform = p.platform AND c.normalized_url = n.normalized_url
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH normalized AS (
  SELECT
    p.id,
    regexp_replace(
      regexp_replace(
        regexp_replace(p.canonical_profile_url, '^https?://www[.]', 'https://'),
        '[?#].*$',
        ''
      ),
      '/+$',
      ''
    ) AS normalized_url,
    row_number() OVER (
      PARTITION BY p.account_id, p.platform,
        regexp_replace(
          regexp_replace(
            regexp_replace(p.canonical_profile_url, '^https?://www[.]', 'https://'),
            '[?#].*$',
            ''
          ),
          '/+$',
          ''
        )
      ORDER BY p.id
    ) AS normalized_rank
  FROM "crm_lead_profiles" p
  WHERE p.canonical_profile_url IS NOT NULL
)
UPDATE "crm_lead_profiles" p
SET
  "canonical_profile_url" = CASE WHEN n.normalized_rank = 1 THEN n.normalized_url ELSE p."canonical_profile_url" END,
  "normalized_handle" = CASE
    WHEN p."platform" = 'linkedin' THEN regexp_replace(regexp_replace(p."canonical_profile_url", '^https?://(www[.])?linkedin[.]com/(in|company)/', ''), '/+$', '')
    ELSE regexp_replace(regexp_replace(p."normalized_handle", '^@+', ''), '/+$', '')
  END,
  "updated_at" = now()
FROM normalized n
WHERE p.id = n.id;
--> statement-breakpoint
WITH normalized AS (
  SELECT
    l.id,
    regexp_replace(
      regexp_replace(
        regexp_replace(l.canonical_profile_url, '^https?://www[.]', 'https://'),
        '[?#].*$',
        ''
      ),
      '/+$',
      ''
    ) AS normalized_url,
    row_number() OVER (
      PARTITION BY l.account_id, l.platform,
        regexp_replace(
          regexp_replace(
            regexp_replace(l.canonical_profile_url, '^https?://www[.]', 'https://'),
            '[?#].*$',
            ''
          ),
          '/+$',
          ''
        )
      ORDER BY l.id
    ) AS normalized_rank
  FROM "leads" l
  WHERE l.canonical_profile_url IS NOT NULL
)
UPDATE "leads" l
SET
  "canonical_profile_url" = CASE WHEN n.normalized_rank = 1 THEN n.normalized_url ELSE l."canonical_profile_url" END,
  "normalized_handle" = CASE
    WHEN l."platform" = 'linkedin' THEN regexp_replace(regexp_replace(l."canonical_profile_url", '^https?://(www[.])?linkedin[.]com/(in|company)/', ''), '/+$', '')
    ELSE regexp_replace(regexp_replace(l."normalized_handle", '^@+', ''), '/+$', '')
  END,
  "updated_at" = now()
FROM normalized n
WHERE l.id = n.id;
