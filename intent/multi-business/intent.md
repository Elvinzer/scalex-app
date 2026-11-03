---
status: accepted
tier: critical
base: 6ab432981e5d5e3638f437de5f4aef079c068ab2
---

# Independent businesses under one login

The user authorized implementing the reviewed concept and testing the complete flow. Source: `concepts_brief.md` and `docs/reviews/multi-business/round-1-report.md`.

## Outcome

A person can own several businesses and join others with one login. Each business has independent data, integrations, AI configuration and consumption, member permissions and subscription. A compact selector fits the existing sidebar and mobile navigation. Expiry or failed payment blocks that business except owner billing recovery. An owned business can be exempt while its owner is a Minaly admin. Existing records, provider connections, subscription identities and public booking destinations survive migration.

## Spec

* Create real business identities independently of Supabase users. Preserve old business UUIDs for legacy records. Repoint operational foreign keys; retain personal actor foreign keys separately.
* Move business configuration out of users. Personal preferences and authentication remain attached to the person. Never create artificial login identities to represent businesses.
* Scope each authenticated tab through `/b/{businessId}`. Proxy rewrites preserve the existing route tree and inject trusted context. API calls/actions use explicit path or same-origin referring tab. Membership and entitlement are checked server-side; invalid context never falls back to another business.
* Keep the existing owner and custom member roles. A person can own A and be a restricted member of B. Invitations are consumed atomically and recheck host entitlement and capacity.
* Use the existing plan catalogue per business. Additional businesses have no extra trial. Checkout is resumable and duplicate-safe. Admin exemption belongs only to an admin-owned business, never a customer business an admin joins.
* Verify signatures and idempotency for billing webhooks. Failed invoice blocks even before a delayed subscription event. Authoritative paid/current subscription state restores access; browser return URLs do not. Preserve legacy subscription mappings.
* Stop AI/outbound work for suspended businesses. Preserve authenticated inbound provider records and billing events so recovery does not lose history; keep bounded retries and existing job controls.
* Refuse personal identity deletion while the person owns an open business, before any billing/provider side effect. Preserve historical attribution in unrelated businesses.
* Test with disposable local Postgres and local browser identities, not live customer writes or real charges/emails. Apply the validated committed-format Drizzle migration to the configured shared database only after upgrade and isolation evidence.

## Acceptance

1. Existing owner data, subscription and public links survive migration, including an owner who is also a member elsewhere.
2. An admin can create two independent businesses; a normal owner can create another pending business and activate it only with its own paid subscription.
3. One person can switch between owned/joined businesses; role restrictions and revoked access apply independently.
4. A and B tabs/forms/actions remain pinned to their businesses, including navigation, API requests and OAuth callbacks.
5. Repeated checkout and duplicate/out-of-order signed billing events cannot double-subscribe, misassign or incorrectly unblock a business. Invalid signatures fail.
6. Suspended owners see billing recovery only; members see suspension and owner-contact/exit actions. Other businesses remain usable.
7. Business integrations and AI use the selected business's configuration and usage. Inbound records remain recoverable; suspended outbound work is denied.
8. Personal account deletion cannot erase owned business data or another business's history.
9. FR/EN catalogues, desktop/mobile visible states, typecheck, lint, full tests and production build pass. Next runtime reports no compilation/runtime failures on exercised routes.

## Steps

- [x] Extract business schema/configuration, backfill legacy identities and strengthen RLS. Check: disposable upgrade with preserved rows and allowed/denied RLS queries.
- [x] Implement explicit request context, entitlement and migration of operational callers/jobs/OAuth. Check: concurrent scope, permissions, suspended API/action boundaries.
- [x] Implement per-business billing, lifecycle and atomic invitations. Check: persisted checkout and signed webhook retry/failure/recovery scenarios.
- [x] Integrate business creation and selector in the existing interface. Check: actual desktop/mobile browser flow in FR/EN, two tabs, blocked states.
- [x] Prepare and verify the complete candidate for independent review. Check: acceptance-by-acceptance evidence below; independent review and shared deployment follow this committed candidate.

## Result

Candidate implementation verified on 2026-11-03. Independent review and shared migration/preview deployment remain release gates after this commit.

- Acceptance 1: disposable upgrade via the official migration command, 264 assertions and a second identical logical database digest. See `docs/reviews/multi-business/evidence/migration-verification.md` and its raw log/JSON.
- Acceptance 2, 3, 4, 6: actual desktop/mobile FR/EN browser flows, two simultaneous business tabs, admin creation, pending owner creation, restricted member, blocked owner and recovery navigation. See `docs/reviews/multi-business/evidence/browser-verification.md` and screenshots.
- Acceptance 4, 7: 10 live local API/Next checks, including foreign scope rejection, forged headers, conflicting scope, signed extension pinning and suspension/renewal. See `docs/reviews/multi-business/evidence/runtime-api-verification.json`. Extension chooser visibly lists only the current person's businesses, with unavailable CRM businesses disabled (`extension-business-selection.png`).
- Acceptance 5, 7, 8: 38 real PostgreSQL integration tests pass, including signed billing webhook state/failure/retry, atomic invitations, independent configuration and RLS financial write denial. Provider transport is simulated; no real charge, email or OAuth vendor mutation was made.
- Acceptance 9: full suite 189 files passed, 3 skipped; 856 tests passed, 37 skipped. Database suites were separately enabled and all 38 passed. Production Turbopack build succeeded with extension 0.3.11 and 116 generated pages. Typecheck, lint and diff checks are required before the candidate commit.

The existing configured Supabase database has only been inspected read-only and remains at migration 0071 at candidate preparation. Migration 0072 retains physical legacy configuration columns and synchronizes the unambiguous original business for deployment compatibility; 0073 locks financial control writes and preserves valid cross-business referrals.

Independent review of candidate `745562a` found one critical metric-chat tracking scope error. The correction resolves selected business and diagnostic permission before reads/writes. Four additional real PostgreSQL cases verify different A/B rates, suspended A, repeated B opens, independent owner UUIDs, joined-member permissions, suspended target and foreign context. A bounded follow-up audit also corrected default booking closers and CRM owner responsibility checks to use the personal owner UUID. Regression tests pass. These corrections require a fresh review before release.
