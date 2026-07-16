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
- `npm run typecheck` — auto-déclenché après chaque edit via hook (`.claude/settings.json`) ; relancer manuellement si le hook est absent
- `npm run db:push` — appliquer une migration Drizzle en dev
- `npm run lint` — avant chaque commit

## Definition of Done
Avant de dire qu'une tâche est terminée :
- [ ] `npm run typecheck` et `npm run lint` passent
- [ ] Aucun secret dans le diff (clé API, `.env`, token Stripe/Supabase)
- [ ] `.env.example` mis à jour si une nouvelle variable d'env a été ajoutée
- [ ] Preview Vercel qui build sans erreur
- [ ] Migration Drizzle appliquée (`db:push`) si `db/schema.ts` a été touché

## Code style
- ES modules uniquement, jamais de `require`
- Server Components par défaut, `"use client"` seulement si interactivité réelle
- Server Actions pour les mutations simples, route handlers pour les webhooks/API externes
- Pas de `any` en TypeScript. Si un type est incertain, demander plutôt que deviner.
- Tailwind uniquement, pas de CSS-in-JS
- Validation (Zod) sur toute donnée qui traverse une frontière externe : payloads webhooks,
  inputs formulaire, réponses tool-use de l'agent. Jamais de `as` non validé sur du input externe.

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
- Chaque job Inngest (brief hebdo, sync Stripe, relances) doit être idempotent (re-run safe),
  pas seulement les webhooks Stripe.
- Logger le nombre de tokens (input/output) de chaque appel à l'agent — c'est la clé du
  client qui paie, il doit pouvoir voir sa conso.

## Sécurité (toute l'app, pas seulement BYOK/Stripe)
- Chaque route dans `app/(app)/` et `app/api/` vérifie la session Supabase côté serveur
  (jamais confiance en un état client) ; RLS Postgres activée sur toutes les tables user-scoped,
  policies vérifiées à chaque migration touchant `db/schema.ts`
- Zod sur toute frontière externe (déjà dans Code style) + sanitize de tout ce qui est
  affiché en `dangerouslySetInnerHTML` ou injecté dans du HTML (emails React Email inclus)
- Rate limiting sur les endpoints publics/non-authentifiés (formulaires, webhooks, auth)
  pour limiter l'abus et le credential stuffing
- Headers de sécurité (CSP, `X-Frame-Options`, `Referrer-Policy`, HSTS) configurés au niveau
  Next.js/Vercel, jamais désactivés pour "debug rapide" en prod
- Aucune donnée sensible (clé Anthropic, token Stripe/Supabase, session) dans les logs,
  Sentry, ou messages d'erreur renvoyés au client
- Dépendances : `npm audit` avant chaque ajout de package non trivial ; pas de package
  peu maintenu ou sans historique clair dans le flux BYOK/paiement
- Toute nouvelle route ou Server Action qui touche à l'auth, aux paiements ou à la clé
  Anthropic suit la règle déjà en place : proposer un plan avant d'éditer

## Workflow Git (on est 2, dont 1 non-technique)
- Phase init (pas encore d'utilisateurs réels) : tout se passe sur `main`, commits directs,
  pas de branche ni de PR — on garde ça simple tant qu'il n'y a rien à casser en prod
- Dès qu'il y a des vrais utilisateurs ou un premier déploiement à protéger, revenir à un
  modèle avec une branche de travail séparée (`dev`) et `main` protégée — à rediscuter
  à ce moment-là, ne pas l'introduire prématurément
- [PRÉNOM NON-TECH] travaille uniquement sur des tâches front/copy/marketing, jamais sur
  `lib/agent/`, `db/schema.ts`, ou les webhooks Stripe
- Ne jamais committer de secrets — vérifier qu'aucune clé n'apparaît dans un diff avant de proposer un commit

## SEO / GEO (app/(marketing)/ uniquement — jamais app/(app)/)
- Objectif : ultra SEO/GEO côté public. Zéro effort SEO côté produit — `app/(app)/` reste
  `noindex, nofollow` (robots meta + `robots.txt`) et n'a aucune des obligations ci-dessous
- JSON-LD (Organization, SoftwareApplication, FAQPage) sur chaque page publique
- `llms.txt` et `llms-full.txt` à la racine tenus à jour avec le contenu réel
- Chaque page de contenu répond à la question dans le premier paragraphe, avec un chiffre
  concret — pensé pour être cité par un moteur génératif, pas juste indexé
- `sitemap.xml` et `robots.txt` générés dynamiquement, tenus à jour à chaque nouvelle page
- Metadata Next.js (`title`, `description`, canonical, Open Graph, Twitter card) sur
  chaque page de `app/(marketing)/`, jamais de valeurs par défaut génériques copiées-collées
- HTML sémantique (un seul `h1`, hiérarchie de headings propre, `alt` descriptif sur les images)
- Core Web Vitals surveillés : images en `next/image`, pas de JS bloquant le rendu,
  `app/(marketing)/` reste statique/ISR (voir Structure) pour rester rapide

## Ce qu'il ne faut PAS faire
- Ne pas ajouter de vector DB managé (Pinecone etc.) — pgvector (Supabase) suffit si besoin
- Ne pas ajouter Trigger.dev ou un orchestrateur payant tant qu'Inngest free tier suffit
- Ne pas écrire de tests e2e complets avant la Phase 1 (MVP) terminée — prioriser la vitesse
- Si une tâche touche `lib/agent/`, `db/schema.ts`, les webhooks Stripe, ou l'auth : proposer
  un plan avant d'éditer, ne pas foncer directement dans le code
- Ne pas ajouter de serveur MCP par confort — chaque serveur connecté charge ses définitions
  d'outils à chaque message, même si non utilisé
- Pour une recherche large dans le code (où est utilisé X, quels fichiers touchent Y) :
  déléguer à un subagent d'exploration plutôt que de driver ça en contexte principal
