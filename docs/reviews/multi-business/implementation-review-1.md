---
slug: multi-business
reviewed_head: 745562a013ef928840d9482cf765c4aa08bb9f91
verdict: fail
---

# Report: independent businesses

## Checked
- PASS | Independence | Fresh reviewer context contained only the handoff, repository instructions and committed artifacts, not the implementation conversation.
- PASS | Snapshot | HEAD matched reviewed_head; original working tree clean; steps checked and Result filled. Checks ran in detached `/tmp/minaly-final-review`.
- PASS | Acceptance 1, migration safety | `npm run test:business-migration`: official migrations 72/73 applied twice to fresh loopback database `minaly_multibusiness_migration_20261103_5b6eceda`; legacy ownership, membership, sales, subscription/customer IDs and booking handles retained; repeat digest identical; RLS financial-control denials passed. Raw command output inspected.
- PASS | Database failure paths | `MULTI_BUSINESS_TEST_DATABASE_URL=<disposable loopback URL> npm run test:multi-business`: 34/34 PostgreSQL integration tests passed, including billing signatures/order/retry, invitations, isolated configuration and control records.
- PASS | Acceptance 9 checks | `npm run test`: 188 files, 851 tests passed; 2 files/33 tests skipped. `npm run lint`, `npm run typecheck` and isolated production `npm run build` passed, 116 generated pages.
- PASS | Partial UI verification | Actual agent-browser desktop opened FR selector showing owned A and joined B; created independent admin-owned UUID `65e9a633-8e41-442d-acb5-529de3a82efb`, selected English in onboarding and skipped to its scoped Roadmap; visible labels translated. Turbopack MCP compilation issues empty.

## Findings
- CRITICAL | `lib/improve-chat-tracking.ts:79`: the metric branch of `recordImproveChatOpened` uses authenticated personal `userId` as the business scope. It reads `getDiagnosticKpiRawData(userId)`, updates `businesses.id=userId` (line 102), and reads/inserts `improvementEvents.userId=userId` (lines 114–124), with no selected-business permission or entitlement check. The content-idea branch resolves permissions, but the metric branch does not.
- Narrow reproduction: legacy owner U owns A (`A.id=U.id`) and opens a metric improvement chat in active B, which U owns or has joined. With a non-null corresponding rate in A, the ordinary dashboard/roadmap/floating-chat callers invoke this action and it writes A's rate snapshot and journal event, leaving B unchanged. A being suspended does not prevent the write. For a newly created owner whose business UUID differs from U, the action instead reads the wrong/empty scope. The actor-to-business dataflow and SQL predicates establish the defect directly; no live provider request is needed.
- Required evidence after correction: resolve selected business and required permission/entitlement before metric reads/writes; keep personal actor attribution separate. Verify persisted A/B state with different rates, owner/member contexts, a suspended target and an identity whose UUID matches no business.

## Not checked
- Review stopped at the first CRITICAL as required by sdlc-verify. Remaining diff, complete UI/error/mobile journeys and all Acceptance items are not certified.
- No shared/default database, remote provider, email or real billing mutation was performed. Shared migration and Vercel preview remain release gates.
- The synthetic migration fixture's incomplete legacy profile caused recoverable profile-unavailable console errors on its dashboard; this was not attributed to the change. Newly created business onboarding/Roadmap rendered successfully. A clean complete-fixture runtime pass remains necessary after the fix.
