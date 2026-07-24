# Audit de performance — Scale X

Date : 2026-07-25. Mesures avant toute optimisation, comme demandé. Chaque
section indique **comment** le chiffre a été obtenu et son statut : mesuré
directement, ou en attente (nécessite un navigateur authentifié que cet
environnement n'a pas).

## Delta mesuré après les 2 correctifs "gain immédiat, risque nul"

Appliqués : import dynamique d'`ImportFlow` (§4) + `cache()` React sur le
pipeline diagnostic (`getBusinessProfile`, `getDiagnosticBenchmarks`,
nouveau `getDiagnosticKpiRawData`, `getCurrentUser`). Aucun changement de
logique/calculs/UI — uniquement le chemin d'exécution. Re-mesuré avec le
même `ANALYZE=true npx next build` que §2 :

| Page | Avant | Après | Delta |
|---|---|---|---|
| `/datas` (Mes chiffres) | 642 Ko | **161 Ko** | **−481 Ko (−75 %)** |
| `/onboarding` | 612 Ko | **132 Ko** | **−480 Ko (−78 %)** |
| Dashboard/Diagnostic/Overview/Copilote/Ads | inchangé (attendu — le fix cache() réduit le TEMPS serveur, pas la taille du bundle) | — | — |

Le cache() réduit le nombre d'aller-retours DB par navigation (mesurable en
TTFB/Server Timing, pas en poids de bundle) — sa vérification chiffrée
dépend de la même passe Lighthouse que §1, toujours en attente. `npm run
typecheck`/`lint`/`test` : verts. Smoke test des 7 pages touchées : 307
partout, aucune 500.

## Résumé exécutif

Deux causes racines concrètes et bien étayées, avant même de regarder
Lighthouse :

1. **`exceljs` + `pdf-parse` + `papaparse` (≈380 Ko gzip à eux trois) sont
   chargés au premier rendu de `/datas` et `/onboarding`**, alors qu'ils ne
   servent qu'à l'ouverture de la modale d'import. C'est un import statique,
   pas un problème de mesure — la preuve est dans le bundle lui-même.
2. **Le moteur de diagnostic est recalculé deux fois par page** : une fois
   dans `app/(app)/layout.tsx` (badge Scale Score de la sidebar, sur
   TOUTES les pages) et une deuxième fois dans la page elle-même
   (Dashboard, Diagnostic, Vue d'ensemble, Copilote, Ads) — deux
   aller-retours DB pour les mêmes données, sur chaque navigation.

Le reste de l'audit (index DB, images, polices, squelette de navigation)
est déjà conforme ; pas de travail supplémentaire à y faire tant que les
mesures ne le justifient pas.

## 1. Lighthouse (mobile + throttling) — EN ATTENTE

Aucun navigateur pilotable ni session authentifiée dans cet environnement
d'exécution (pas de Chrome CLI, pas de Playwright/puppeteer installés, pas
de cookie de session valide). Décidé avec l'utilisateur : il lance
lui-même Lighthouse (Chrome DevTools, mode mobile + throttling, connecté)
sur Dashboard / Mes chiffres / Diagnostic / Vue d'ensemble / Mail /
Copilote, et partage FCP/LCP/TBT/CLS/poids/requêtes. **Cette section sera
complétée avec ces chiffres avant toute optimisation qui en dépend**
(en particulier la priorisation fine de l'Étape 3).

## 2. Composition du bundle (mesuré — build de production, webpack)

`next build --turbopack` ne produit pas de rapport analysable par
`@next/bundle-analyzer` (l'analyseur s'accroche à la compilation webpack,
pas à Turbopack) — build de mesure fait avec `ANALYZE=true npx next build`
(webpack, ponctuel, n'affecte pas le script `build` normal). Rapport HTML :
`.next/analyze/client.html` (régénérable, pas committé).

### Top des chunks par poids (gzip)

| Chunk | Gzip | Brut | Chargé au premier rendu de |
|---|---|---|---|
| `exceljs.min.js` | **248 Ko** | 925 Ko | `/datas`, `/onboarding` |
| `pdf-parse` (web) | **130 Ko** | 989 Ko | `/datas`, `/onboarding` |
| vendor "469" (recharts + redux-toolkit interne + d3-shape) | 107 Ko | 1306 Ko | `/overview` uniquement |
| vendor partagé (sentry/posthog probable) | 71 Ko | 226 Ko | tout `(app)` + `/onboarding` |
| framework Next/React | 56 + 53 + 45 Ko | — | `main`/`main-app` (incompressible) |
| vendor partagé | 44 Ko | 462 Ko | Dashboard, Diagnostic, Overview, Mail, Ads, Contenu, Suivi, Vidéos, Réglages, Intégrations, Settings/Équipe/Facturation |

### Tailles First Load JS par page (depuis la sortie de build)

| Page | JS propre | First Load JS |
|---|---|---|
| `/dashboard` | 7,5 Ko | **209 Ko** |
| `/datas` (Mes chiffres) | 5,2 Ko | **642 Ko** ⚠️ |
| `/diagnostic` | 5,25 Ko | **214 Ko** |
| `/overview` (Vue d'ensemble) | 113 Ko | **395 Ko** ⚠️ |
| `/acquisition/mail` | 3,77 Ko | **209 Ko** |
| `/copilote` | 4,17 Ko | **156 Ko** |
| `/onboarding` | 7,13 Ko | **612 Ko** ⚠️ |
| Base partagée (framework) | — | 102 Ko |

**Conclusion** : `/datas` et `/onboarding` sont 3x plus lourds que le reste
de l'app à cause d'un seul import statique (§4). `/overview` est le
deuxième point chaud, à cause de `recharts` — déjà correctement isolé à
cette seule page (pas de fuite ailleurs), donc pas un problème de
*bundling* mais potentiellement de *rendu* (à confirmer par le TBT
Lighthouse de cette page).

## 3. Long tasks / thread principal — EN ATTENTE (nécessite Lighthouse/Performance tab, cf §1)

## 4. Librairies lourdes — imports statiques vs dynamiques (mesuré par grep + bundle)

| Librairie | Utilisée dans | Import | Verdict |
|---|---|---|---|
| `exceljs` | `lib/import/parse.ts` (via `ImportFlow`) | **statique**, à la racine de `datas-page-client.tsx` et `onboarding-flow.tsx` | ❌ à corriger |
| `pdf-parse` | `lib/import/parse.ts` (idem) | **statique**, même chemin | ❌ à corriger |
| `papaparse` | `lib/import/parse.ts` (idem) | **statique**, même chemin | ❌ à corriger |
| `recharts` | `components/overview-revenue-chart.tsx` (seul point d'usage dans tout le repo) | statique, mais scoping déjà correct (une seule page) | ✅ conforme — pas de fuite, à réévaluer seulement si le TBT d'Overview est mauvais |
| `canvas-confetti` | `components/celebration.tsx` | **déjà** `void import("canvas-confetti").then(...)` | ✅ déjà conforme |

`ImportFlow` (donc `exceljs`+`pdf-parse`+`papaparse`) est importé de façon
statique alors qu'il ne s'affiche que dans un `Drawer` fermé par défaut —
un import statique reste dans le bundle initial même si le composant n'est
rendu conditionnellement qu'après ouverture ; seul un vrai point de
découpage (`next/dynamic`) retire réellement ces ~380 Ko gzip du premier
chargement de `/datas` et `/onboarding`.

## 5. Index DB (mesuré — `information_schema` + lecture de `db/schema.ts`)

Les 4 familles de tables citées dans le correctif ont **déjà** l'index
composite attendu — rien à ajouter :

| Table | Index existant |
|---|---|
| `monthly_metrics` | `uniqueIndex(user_id, year, month)` |
| `sales` | `index(user_id, sale_date)` |
| `content_posts` | `index(user_id, published_at)` |
| `agent_chat_messages` | `index(user_id, agent_key, created_at)` |
| `business_levers` | `uniqueIndex(user_id, lever_key)` |

Pas d'`EXPLAIN` poussé au-delà : les tables sont encore petites (peu
d'utilisateurs actifs), un scan séquentiel serait de toute façon rapide —
les index sont correctement anticipés pour la montée en charge, ce n'est
pas le goulot actuel.

## 6. Requêtes en cascade / N+1 (mesuré par lecture de code)

- **Pages** (Dashboard, Diagnostic, Overview, Mail, Ads, Copilote, etc.) :
  chacune fait ses fetchs en un seul `Promise.all(...)`, pas de cascade
  séquentielle — conforme à "un aller-retour groupé par page".
- **Repli confirmé** : `app/(app)/layout.tsx` (monté sur CHAQUE page) ET la
  page elle-même (`dashboard/page.tsx`, `diagnostic/page.tsx`,
  `overview/page.tsx`, `copilote/page.tsx`, `acquisition/ads/page.tsx`)
  appellent chacun indépendamment `aggregatePeriodTotals`/
  `computeDiagnosticPoints`/`computeScaleScore`, avec leurs propres requêtes
  `settingKpiEntries`/`closingKpiEntries`/`monthly_metrics` — donc les MÊMES
  lignes sont lues deux fois en DB à chaque navigation. Aucune de ces
  fonctions n'est mémoïsée (contrairement à `getAccountContext`, qui utilise
  déjà `cache()` de React — le pattern existe dans ce repo, juste pas
  appliqué ici). → détail en §"Suspects" ci-dessous.
- **N+1 en écriture (secondaire, hors scope "chargement de page")** :
  `app/(app)/datas/import-actions.ts` insère les lignes `sales`/
  `content_posts`/`ad_campaigns` importées une par une dans une boucle
  `for...of` avec `await` séquentiel — pas une régression de chargement de
  page, mais ralentit la validation d'un gros import CSV. Noté, pas
  prioritaire pour ce correctif.

## 7. Cache du moteur de diagnostic (mesuré)

- **Aucune mise en cache** de `aggregatePeriodTotals`/`computeDiagnosticPoints`/
  `computeScaleScore` n'existe — recalculé à chaque appel, y compris deux
  fois par page (§6). Pas de cache par `(user, période, version des
  données)` comme demandé dans le correctif — c'est à construire, pas à
  vérifier.
- **Debounce 30 s sur les rafales de webhooks Stripe : n'existe pas.**
  `lib/inngest/functions/sync-stripe-account.ts`'s `inngest.createFunction`
  ne déclare ni `debounce`, ni `throttle`, ni `rateLimit`. Le correctif le
  décrit comme "déjà spécifié" — vérifié dans le code, ce n'est pas le cas
  aujourd'hui. À construire si on juge que des rafales de webhooks sont un
  vrai risque (hors du scope strict "chargement de page", mais mentionné
  explicitement dans le brief).

## 8. Images Falco (mesuré — déjà traité dans un chantier précédent)

| | Cible | Mesuré |
|---|---|---|
| Skin plein pied (1x) | < 150 Ko | 29–37 Ko ✅ |
| Portrait bulle (1x) | < 30 Ko | 14,5–17,4 Ko ✅ |
| Format | WebP + fallback PNG | ✅ (`public/falco/skins/`) |
| width/height explicites | oui | ✅ (`FalcoSkinImage`) |
| Lazy hors viewport | oui | ✅ (`loading="lazy"` sauf `priority`) |
| Prefetch scopé | onglets du pilier courant + portraits globaux | ✅ (`acquisition/layout.tsx`, `ventes/layout.tsx`, `app/(app)/layout.tsx`) |
| PNG brut en prod | aucun | ✅ aucun PNG non compressé servi |

Rien à faire ici — déjà conforme au budget du correctif.

## 9. Squelettes / affichage progressif / polices (mesuré)

- **Police** : `next/font/google` (Inter) déjà utilisée dans `app/layout.tsx`
  — self-hosted, `font-display: swap` par défaut de `next/font`. ✅ conforme,
  pas de FOIT.
- **Squelette de navigation** : `app/(app)/loading.tsx` existe déjà (un seul,
  générique, affiché par Next pendant que le Server Component de la page
  cible résout) — meilleur que "aucun skeleton", mais **générique** (même
  forme pour toutes les pages) et **page-level seulement** : aucune page
  n'utilise de `<Suspense>` interne pour afficher le hero/les metric cards
  dès qu'ils arrivent pendant qu'un bloc plus lent (graphique, tableau)
  finit de charger — tout un `page.tsx` attend son unique `Promise.all`
  avant de rendre quoi que ce soit. C'est l'écart réel avec "le hero et les
  metric cards s'affichent dès que leurs données arrivent" du correctif.
- **Aucun script tiers bloquant en `<head>`** trouvé (PostHog/Sentry
  chargés côté client de façon standard, pas de `<script>` synchrone
  ajouté manuellement).

## 10. Re-renders / tableaux longs (mesuré par lecture de code)

- Pas de store global (Redux/Zustand/Context géant) dans ce repo — les
  données sont passées en props depuis des Server Components, donc pas de
  risque de "re-render de toute la page" par un store mal découpé. Ce
  suspect ne s'applique pas ici.
- **Tableaux sans pagination ni virtualisation, confirmés** :
  - `app/(app)/ventes/suivi/sales-table.tsx` — `sales.map(...)` sur la
    liste complète, aucun `.slice()`/limite.
  - `app/(app)/acquisition/contenu/posts-table.tsx` — même pattern.
  - Pas de page "transactions Stripe" dédiée dans ce repo (mentionnée dans
    le brief mais n'existe pas actuellement — Stripe Connect expose son
    propre dashboard pour ça) : rien à corriger là où il n'y a pas de code.
  - Pas encore un problème mesuré (comptes avec peu de ventes/posts
    aujourd'hui) mais à surveiller — pagination serveur recommandée avant
    que ces listes dépassent ~200 lignes.

## Priorisation retenue pour l'Étape 3 (gain/effort, sur la base de ce qui précède)

1. **`ImportFlow` en `next/dynamic({ ssr: false })`** sur `/datas` et
   `/onboarding` — retire ~380 Ko gzip du premier chargement de ces 2
   pages, zéro changement de comportement visible, risque nul.
2. **`cache()` React autour du pipeline diagnostic** (mêmes fonctions déjà
   utilisées, juste mémoïsées par requête comme `getAccountContext`) —
   supprime le double calcul/double aller-retour DB sur chaque page,
   toujours zéro changement de sortie.
3. Squelettes par bloc (Suspense interne aux pages les plus lourdes —
   Overview, Datas) une fois les 2 premiers points mesurés à nouveau.
4. Pagination des tableaux Suivi des ventes/Contenu — pas urgent au volume
   actuel, à faire avant que ça le devienne.
5. Debounce Stripe webhook + cache diagnostic invalidé aux triggers
   (save Datas, save Mon business, webhook Stripe) — construction, pas
   juste une vérification, donc le plus gros morceau ; à planifier
   séparément une fois 1-2 validés par une nouvelle mesure Lighthouse.

**Rien de tout ça n'est appliqué à ce stade** — ce rapport est la mesure
préalable demandée. Prochaine étape : ta passe Lighthouse (§1), puis je
propose un plan pour les points 1-2 ci-dessus (les seuls "gain immédiat,
risque nul" au sens du correctif) avant d'y toucher.
