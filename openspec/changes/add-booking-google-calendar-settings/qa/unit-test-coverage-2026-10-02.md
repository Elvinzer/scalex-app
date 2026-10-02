# Google Calendar settings unit coverage

Date: 2026-10-02

## Added coverage

- Multi-account calendar resolution, primary-calendar selection, readiness failures and stable Google `sub` matching, including legacy email-only connection upgrade.
- Google event creation retry and Meet URL recovery, bounded Meet `pending`, expired or revoked tokens, target change, disconnect, moving an existing event and cancellation.
- Account and closer predicates for event, agenda, reschedule-slot, upcoming-booking and booking-lead queries; owner-wide visibility; event and link mutation denials outside scope.
- Drizzle RLS declarations for booking events, closer assignments, links, leads, bookings and calendar connection/settings/conflict tables.

## Validation

- `npm run test`: 164 test files passed, 707 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `openspec validate add-booking-google-calendar-settings --type change --strict --no-interactive`: valid.

## Limits

These are isolated unit tests with mocked Google responses and database calls. They do not exercise live Google OAuth/Meet, PostgreSQL's RLS engine under real Supabase owner/member JWTs, or the authenticated multi-user browser flows. Tasks 9.2–9.7 remain open for the dedicated E2E environment and test accounts.
