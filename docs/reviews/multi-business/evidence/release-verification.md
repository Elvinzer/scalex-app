# Multi-business release verification

Reviewed source: `cab903798b1ea5b84420580cd0de93c616b9e41c`. Independent verdict: pass in `intent/multi-business/report.md`.

- Full suite: 856 tests passed; 37 skipped in the default run. The guarded PostgreSQL suites were enabled separately: 38 tests passed. Typecheck, lint, local production build, desktop/mobile FR/EN journeys and 10 API/Next runtime checks passed.
- Migration replay: canonical historical constraint name passed 264 assertions; legacy constraint alias passed 265. Both scenarios ran the official command twice with identical second-run contents.
- Configured shared database: migrations 0072 and 0073 applied through `npm run db:migrate`. Read-only verification compared all 129 original tables immediately after migration: no reduced row counts, no changed original-row digest and no orphaned subscriptions. The database now has 132 public tables and 74 recorded migrations. See `shared-migration-verification.json`.
- Vercel preview: Ready, Next.js 16.3.8, 116 generated pages, successful migration replay. All 1711 tracked source files matched the reviewed staging copy.
- Preview HTTP checks: sign-in 200 with the actual Minaly form; private business management 307 to sign-in; unauthenticated extension-session POST 401. Deployment Protection remains enabled. See `vercel-preview-verification.json`.

Preview: https://scalex-9k5l106b7-cedrics-projects-87cca661.vercel.app

The production deployment was not promoted. Authenticated product journeys used disposable local identities and PostgreSQL. Provider transports were simulated, with real signature and persistence checks; no live charge, email or provider mutation was performed. The intent remains available for user acceptance.
