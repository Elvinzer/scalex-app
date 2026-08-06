# Scale X — AGENTS.md

SaaS BYOK qui diagnostique le goulot d'étranglement business d'un infopreneur US
(10-100k$/mois) et déploie un agent Codex qui le corrige, pas juste un dashboard.

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
- `lib/agent/` — logique d'appel à l'API Codex (toujours avec la clé BYOK du user, jamais la nôtre)
- `BUILD_LOG.md` — un insight/décision par jour, sert de matière pour le build in public

## Commandes
- `npm run dev` — lancer en local
- `npm run typecheck` — auto-déclenché après chaque edit via hook (`.Codex/settings.json`) ; relancer manuellement si le hook est absent
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

## Design system (DA)
- N'utiliser QUE les couleurs de la DA : tokens CSS (`--accent`, `--accent-2`, `--state-*`,
  `--muted`, etc.) et les `variant` du composant `Button`. Jamais de couleur hex/rgb en dur
  ni de classe Tailwind de couleur brute (`bg-purple-500`, `text-blue-600`…) dans un composant.
- Deux accents de marque, sémantique fixe : corail (`--accent`) = LE CTA prioritaire, unique
  par écran ; violet (`--accent-2`, `variant="accent2"`) = actions IA/analytics uniquement.
  Ne pas détourner l'un pour l'autre.
- Une grille d'actions équivalentes (cartes répétées, listes) n'a PAS de CTA prioritaire :
  utiliser `variant="outline"`, jamais un aplat d'accent répété sur chaque item (mur de couleur).
- En cas de doute sur une couleur/variant, demander plutôt que d'inventer une teinte hors-DA.

## Règles non négociables (BYOK & Stripe Connect)
- La clé API Anthropic du client est CHIFFRÉE en base, jamais en clair, jamais loggée,
  jamais renvoyée au frontend après la saisie initiale (afficher `sk-ant-...xxxx` masqué)
- Tout appel à l'agent utilise en priorité la clé Anthropic BYOK du user courant. Si le user n'a
  pas configuré de clé, fallback sur une clé serveur partagée (`ANTHROPIC_SHARED_API_KEY`),
  protégée comme tout secret (jamais loggée, jamais renvoyée au client) — le quota mensuel par
  user sur ce fallback est centralisé dans un seul point de config (`lib/agent/quota.ts`) pour
  pouvoir le brancher sur les paliers d'abonnement sans refonte
- Les webhooks Stripe Connect DOIVENT vérifier la signature (`stripe.webhooks.constructEvent`)
  et être idempotents (checker un `event.id` déjà traité avant d'agir)
- Ne jamais pré-agréger côté LLM : calculer sommes/taux/deltas en code, envoyer seulement
  les chiffres calculés au modèle. Le produit est AI-augmented, pas AI-native.
- Intégrations actives : Stripe (paiements, source principale du diagnostic, OAuth Connect),
  iClosed (tracking des prises d'appel de closing, clé API BYOK côté client, onglet
  `/ventes/appels` — un appel closé alimente le CA via la table `sales`), Calendly (second outil
  de prise d'appel, Personal Access Token BYOK, mêmes onglets qu'iClosed), Instagram (analytics
  de contenu, OAuth app-level, `/acquisition/contenu`) et YouTube (analytics de chaîne, OAuth
  app-level, même page). Ne pas ajouter Kajabi/Brevo ou une autre intégration sans que ce soit
  explicitement demandé.
- Webhook iClosed : auth par jeton opaque par connexion dans l'URL (`/api/webhooks/iclosed/[token]`)
  + vérification de signature HMAC si iClosed fournit un secret ; idempotent via
  `processed_iclosed_events`. Le mécanisme exact de signature iClosed reste à confirmer sur le
  portail développeur (voir `lib/iclosed/protocol.ts`, seul point à ajuster).
- Chaque job Inngest (brief hebdo, sync Stripe, relances) doit être idempotent (re-run safe),
  pas seulement les webhooks Stripe.
- Logger le nombre de tokens (input/output) de chaque appel à l'agent, que ce soit sur la clé
  BYOK du client (il doit pouvoir voir sa conso) ou sur la clé partagée (suivi de l'exposition
  côté Scale X).

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

## Zones sensibles (`lib/agent/`, `db/schema.ts`, webhooks Stripe, auth)
- Avant d'éditer un de ces fichiers/dossiers : donner un résumé en 2-3 phrases de l'approche
  envisagée dans la réponse (pas un document de plan formel, pas de bascule en Plan Mode),
  puis enchaîner directement sur l'implémentation dans le même tour de réponse
- Si l'approche a plusieurs options structurantes qui changent l'architecture (ex: schéma DB,
  flux d'auth, contrat d'un webhook), lister brièvement les options avant de choisir — sinon,
  ne pas s'arrêter pour une simple confirmation
- Objectif : garder une trace de l'intention avant modification sur ces zones, sans déclencher
  de changement de mode de permission ni interrompre le flux de la session

## Ce qu'il ne faut PAS faire
- Ne pas ajouter de vector DB managé (Pinecone etc.) — pgvector (Supabase) suffit si besoin
- Ne pas ajouter Trigger.dev ou un orchestrateur payant tant qu'Inngest free tier suffit
- Ne pas écrire de tests e2e complets avant la Phase 1 (MVP) terminée — prioriser la vitesse
- Ne pas ajouter de serveur MCP par confort — chaque serveur connecté charge ses définitions
  d'outils à chaque message, même si non utilisé
- Pour une recherche large dans le code (où est utilisé X, quels fichiers touchent Y) :
  déléguer à un subagent d'exploration plutôt que de driver ça en contexte principal

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
rtk uv run <cmd>        # Compact uv project command output
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Codex sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to AGENTS.md
rtk init --global       # Add RTK to ~/.Codex/AGENTS.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
