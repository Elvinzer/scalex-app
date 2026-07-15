# Scale X — CLAUDE.md

SaaS BYOK qui diagnostique le goulot d'étranglement business d'un infopreneur US
(10-100k$/mois) et déploie un agent Claude qui le corrige, pas juste un dashboard.

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Postgres + Auth), Drizzle ORM
- Inngest pour les jobs async (brief hebdo, sync Stripe, relances)
- Stripe Connect (OAuth standard accounts) — on lit le Stripe DU CLIENT
- SDK Anthropic direct (pas de LangChain/LlamaIndex) — clé API fournie par le CLIENT (BYOK)
- Resend + React Email
- Déploiement : Vercel

## Structure
- `app/(marketing)/` — statique/ISR uniquement. SEO/GEO critique. Jamais de logique app ici.
- `app/(app)/` — produit, derrière auth Supabase
- `app/api/` — route handlers (webhooks Stripe, endpoints internes)
- `db/schema.ts` — schéma Drizzle, source de vérité des données
- `lib/agent/` — logique d'appel à l'API Claude (toujours avec la clé BYOK du user, jamais la nôtre)
- `BUILD_LOG.md` — un insight/décision par jour, sert de matière pour le build in public

## Commandes
- `npm run dev` — lancer en local
- `npm run typecheck` — TOUJOURS lancer après une série de modifs, avant de dire que c'est fini
- `npm run db:push` — appliquer une migration Drizzle en dev
- `npm run lint` — avant chaque commit

## Code style
- ES modules uniquement, jamais de `require`
- Server Components par défaut, `"use client"` seulement si interactivité réelle
- Server Actions pour les mutations simples, route handlers pour les webhooks/API externes
- Pas de `any` en TypeScript. Si un type est incertain, demander plutôt que deviner.
- Tailwind uniquement, pas de CSS-in-JS

## Règles non négociables (BYOK & Stripe Connect)
- La clé API Anthropic du client est CHIFFRÉE en base, jamais en clair, jamais loggée,
  jamais renvoyée au frontend après la saisie initiale (afficher `sk-ant-...xxxx` masqué)
- Tout appel à l'agent utilise la clé du user courant, jamais une clé serveur partagée
- Les webhooks Stripe Connect DOIVENT vérifier la signature (`stripe.webhooks.constructEvent`)
  et être idempotents (checker un `event.id` déjà traité avant d'agir)
- Ne jamais pré-agréger côté LLM : calculer sommes/taux/deltas en code, envoyer seulement
  les chiffres calculés au modèle. Le produit est AI-augmented, pas AI-native.
- Une seule intégration à la fois (Stripe d'abord). Ne pas ajouter Kajabi/Brevo/Calendly
  sans que ce soit explicitement demandé.

## Workflow Git (on est 2, dont 1 non-technique)
- Jamais de commit direct sur `main`
- Une branche par feature, PR avec preview Vercel avant merge
- [PRÉNOM NON-TECH] travaille uniquement sur des tâches front/copy/marketing, jamais sur
  `lib/agent/`, `db/schema.ts`, ou les webhooks Stripe
- Ne jamais committer de secrets — vérifier qu'aucune clé n'apparaît dans un diff avant de proposer un commit

## SEO / GEO (app/(marketing)/ uniquement)
- JSON-LD (Organization, SoftwareApplication, FAQPage) sur chaque page publique
- `llms.txt` et `llms-full.txt` à la racine tenus à jour avec le contenu réel
- Chaque page de contenu répond à la question dans le premier paragraphe, avec un chiffre
  concret — pensé pour être cité par un moteur génératif, pas juste indexé

## Ce qu'il ne faut PAS faire
- Ne pas ajouter de vector DB managé (Pinecone etc.) — pgvector (Supabase) suffit si besoin
- Ne pas ajouter Trigger.dev ou un orchestrateur payant tant qu'Inngest free tier suffit
- Ne pas écrire de tests e2e complets avant la Phase 1 (MVP) terminée — prioriser la vitesse
- Si une tâche touche `lib/agent/`, `db/schema.ts`, les webhooks Stripe, ou l'auth : proposer
  un plan avant d'éditer, ne pas foncer directement dans le code
