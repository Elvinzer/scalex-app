# Build Log

Un insight ou une décision par jour — matière pour le build in public.

## 2026-07-15

Scaffold initial : Next.js 15 + Tailwind + shadcn/ui (thème neutre), structure
`app/(marketing)/` / `app/(app)/` / `app/api/`, schéma Drizzle (`users`,
`stripe_connections`, `diagnostics`) branché sur Supabase Auth (`users.id`
référence `auth.users.id`). OAuth Stripe Connect et appel à l'agent Claude :
prochaine session.
