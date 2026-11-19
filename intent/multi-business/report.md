---
slug: multi-business
reviewed_head: cab903798b1ea5b84420580cd0de93c616b9e41c
verdict: pass
---

# Report: independent businesses, correction review

## Checked
- PASS | Supplemental cab9037 review | HEAD matches cab9037; inspected only dd5639b..cab9037 and retained legacy-FK evidence. Detached official migration verification independently passes historical alias (265 assertions, disposable loopback DB minaly_multibusiness_migration_20261103_752f370c) and canonical name (264 assertions, minaly_multibusiness_migration_20261103_c42ba15d), each applied twice with unchanged repeat digest. Direct pg_constraint query confirms validated video_attributions_user_id_businesses_id_fk targeting businesses and no old user FK. Unchanged feature/build/UI results below retained from independent dd5639b review.
- PASS | Independence and snapshot | Fresh reviewer received no implementation conversation; HEAD equaled dd5639b at that review; only prior report untracked; Steps checked and Result filled. Automated checks ran in detached `/tmp/minaly-correction-review`.
- PASS | Prior critical correction | Inspected dd5639b and previous findings. Metric tracking resolves selected business, entitlement and diagnostic permission before business reads/writes; 4 real PostgreSQL cases pass, including suspended A, selected B, joined roles, independent UUIDs, foreign/suspended targets and repeated opens.
- PASS | Related identity fixes | Booking default closer uses businesses.ownerUserId; CRM responsibility checks ownership by personal UUID. Added regression tests pass in the full suite.
- PASS | Acceptance 1 | Reused inspected migration-verification.log/JSON and prior independent migration result; migration code and verifier unchanged. Official upgrade preserves owner/member identities, subscription/customer mappings, records and booking handles; repeated migration digest unchanged; 264 assertions pass.
- PASS | Acceptance 2 | Actual creation evidence and PostgreSQL tests cover two independent admin businesses, duplicate submission and normal-owner pending creation without inherited trial/subscription/credentials; signed billing handler tests activate only the paid business.
- PASS | Acceptance 3 | PostgreSQL tests exercise owned/joined scopes, restricted permissions and revoked access with persisted last authorized state. Inspected desktop/member/mobile evidence and actual selector DOM.
- PASS | Acceptance 4 | Concurrent real-action PostgreSQL writes remain pinned to A/B; retained stale-tab screenshots and browser evidence inspected. Independently repeated runtime verifier: forged headers and conflicting targets denied, signed extension scope pinned, invalid OAuth state rejected locally. OAuth callback/state tests pass.
- PASS | Acceptance 5 | Independently ran 38 PostgreSQL tests: checkout serialization/resumption, duplicate and delayed signed events, invalid signatures, customer/business conflicts, invoice failure before delayed subscription state, retry and authoritative recovery.
- PASS | Acceptance 6 | Actual desktop/mobile local browser opened active Client Business, switched to pending business billing, opened its blocked dashboard, clicked recovery and switched back to active Client Business. Restricted shell exposes recovery/switch/sign-out; member suspension/contact-owner copy and permission gates inspected; database tests verify other business remains usable.
- PASS | Acceptance 7 | Independently exercised configuration/quota/outbox PostgreSQL tests and inspected selected-business provider/usage paths and suspended delivery gates. Recovery failure retains pending rows; retry emits identical scoped outgoing event identities. Runtime session suspension/renewal/recovery checks pass.
- PASS | Acceptance 8 | Real PostgreSQL deletion scenario blocks owned-business deletion before sign-out/provider effects, preserves owned identity through FK protection, and retains another business/member history with nullable personal attribution.
- PASS | Acceptance 9 | Detached npm run test: 189 files/856 tests pass, 3 files/37 tests skipped; separately enabled database suites: 38/38 pass. npm run lint, production npm run build (116 pages) and post-build npm run typecheck pass.
- PASS | Visible/runtime states | Actual agent-browser desktop and 390px mobile selector, blocked owner and billing recovery rendered translated FR copy. Inspected retained opened EN mobile selector screenshot. Repeated verify-business-runtime.mjs reports 10 passes including empty Next compilation/runtime errors; raw output in reviewer tool session and runtime JSON generated in detached checkout.

## Findings
None. Prior critical finding is resolved.

## Not checked
- No shared/default database, live provider mutation, charge or email was attempted. Provider transports remain simulated as required by the accepted Spec; persistence, authorization, signed-event verification and outgoing recovery payloads were exercised.
- Shared migration and Vercel preview deployment remain release gates outside this candidate review. Retained migration and browser artifacts are under docs/reviews/multi-business/evidence/; unchanged evidence was reused only after inspection.
