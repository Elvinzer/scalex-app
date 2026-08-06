## Context

Le booking natif existe déjà (`native_booking_events`, `lib/native-booking/*`, `app/book/[slug]`, `app/api/public/booking/[slug]`). Deux contraintes de l'existant cadrent l'approche :

- Le slug est unique **par compte** (`unique(user_id, slug)`), mais la résolution publique filtre sur `slug` seul (`lib/native-booking/queries.ts:70`) — d'où la collision décrite dans proposal.md.
- Le booking est **account-scoped** : les events sont rattachés au `user_id` du propriétaire de compte, l'accès équipe passe par `native_booking_account_member`. Le handle doit donc vivre sur ce propriétaire, pas par membre.
- Le namespace racine de l'app est déjà occupé (marketing/SEO à la racine, `/admin`, `/api`, `/r/[code]`, `/onboarding`…). C'est pourquoi le handle est imbriqué **sous `/book`** et non à la racine.

Voir proposal.md pour la motivation.

## Goals / Non-Goals

**Goals:**
- URL publique canonique `/book/{handle}/{slug}`, résolue par couple `(handle, slug)`.
- Zéro lien cassé : les anciens `/book/{slug}` redirigent en 301.
- Génération de handle sans friction (lazy, à la 1re création d'event), éditable ensuite.

**Non-Goals:**
- Pas de handle à la racine (`/{handle}/book/{slug}`) — écarté pour ne pas polluer la zone SEO.
- Pas de nouvelle étape dans le wizard d'onboarding.
- Pas de changement du modèle de statut/round-robin/questions des events.
- Pas de handle personnalisable au niveau d'un membre d'équipe individuel (le handle est celui du compte).

## Decisions

### D1. Handle porté par `users.booking_handle`, index unique partiel
Colonne `booking_handle text` sur `users`, avec `uniqueIndex(...).on(bookingHandle).where(sql\`booking_handle is not null\`)`. Nullable car la majorité des comptes n'ont pas encore d'event de booking, et un index unique classique interdirait plusieurs NULL.
- *Alternative écartée* : table `account_handles` dédiée → sur-ingénierie, un handle = un attribut 1-1 du compte.
- *Alternative écartée* : réutiliser `businessName` → texte libre non URL-safe, éditable pour d'autres raisons, non unique.

### D2. Génération lazy, pas à l'onboarding
Le handle est généré au premier `createNativeBookingEvent` si le compte n'en a pas. Rationale : le wizard onboarding (offre → chiffres → diagnostic) ne collecte pas de nom d'entreprise et n'a pas vocation à parler booking ; ajouter une étape alourdirait un flux optimisé. Le handle n'a d'utilité qu'à partir du moment où un lien existe.
- *Alternative écartée* : génération à l'onboarding → friction pour un usage que beaucoup de comptes n'auront jamais.

### D3. Slugification déterministe + suffixe de collision
`slugify(businessName)` → fallback `slugify(email local-part)` → fallback jeton aléatoire. Boucle de suffixe `-2`, `-3` sous contrainte d'unicité DB (retry sur violation d'unicité pour éviter la race entre lecture et écriture).

### D4. Résolution par JOIN `(handle, slug)`
`getPublicNativeBookingEvent` et les fonctions dérivées (`getPublicNativeBookingSlots`, mutations by-token, etc.) prennent `(handle, slug)`. La query joint `users.booking_handle = handle AND event.slug = slug AND event.status = 'active'`. Ça supprime le `.limit(1)` ambigu.

### D5. Arborescence de routes
- `app/book/[handle]/[slug]/` (page + `public-booking-page.tsx`).
- `app/book/[slug]/` conservé comme **shim de redirect** : résout le slug → owner → construit `/book/{handle}/{slug}` → `redirect(..., 301)` en préservant `searchParams`.
- `app/api/public/booking/[handle]/[slug]/route.ts` + `.../ics/route.ts`, ancien `[slug]` gardé en shim de redirect API.
- Liste de mots réservés dans `lib/native-booking/` (partagée validation + génération).

### D6. Rétrocompat 301
301 (permanent) plutôt que 307 pour que les clients mail/navigateurs mettent en cache la nouvelle cible. En cas de collision résiduelle (plusieurs comptes, même slug) : `console.warn` + premier event actif — acceptable vu le faible volume actuel, et de toute façon strictement pas pire que le comportement présent.

### D7. Le handle circule jusqu'au composant client
Le composant `public-booking-page.tsx` construit ~11 requêtes vers `/api/public/booking/{slug}` + le href ICS. Le handle doit donc : (1) être retourné par `getPublicNativeBookingEvent` via un JOIN sur `users.booking_handle`, (2) être passé en prop depuis `page.tsx`, (3) préfixer tous les chemins d'API du composant. Sans ces trois maillons, la page namespacée appellerait des endpoints non namespacés.

*Note* : les clés de brouillon/session du composant sont dérivées de `window.location.pathname` / `slug` ; le changement de chemin invalide un éventuel brouillon en cours au moment de la bascule. Impact négligeable (brouillons éphémères), non traité.

## Risks / Trade-offs

- **Collision résiduelle sur anciens liens** → le shim ne peut pas deviner le bon compte si deux comptes partagent un slug déjà diffusé. Mitigation : warning loggé + premier actif ; volume actuel faible, la fenêtre se referme dès que les nouveaux liens (namespacés) prennent le relais.
- **Édition du handle casse les liens déjà émis avec l'ancien** → Mitigation : avertissement explicite dans l'UI d'édition ; option future (hors scope) de garder un historique de handles pour redirect.
- **Backfill** des comptes existants ayant des events → Mitigation : migration data qui génère un handle pour chaque `user_id` distinct présent dans `native_booking_events` sans handle, en réutilisant la même logique de génération.
- **Course à l'unicité** sur génération concurrente → Mitigation : contrainte DB + retry sur violation, pas seulement un check applicatif.

## Migration Plan

1. Migration Drizzle : ajouter `booking_handle` + index unique partiel (schéma, `db:push`/migrate).
2. Backfill : script/one-off générant un handle pour chaque compte ayant déjà des events de booking.
3. Déployer routes namespacées + shims de redirect ensemble (sinon anciens liens 404 pendant le déploiement).
4. Basculer tous les générateurs de liens internes vers la forme namespacée.
5. Rollback : les shims garantissent que retirer les nouvelles routes ne casse rien ; la colonne peut rester (nullable, sans effet si inutilisée).

### D8. `/book/*` en `noindex`
Les pages de réservation sont transactionnelles et par-client, sans valeur SEO. On les passe en `noindex, nofollow` via la `metadata` Next (`robots: { index: false, follow: false }`) sur la page namespacée et le shim. Aligné sur le principe CLAUDE.md « zéro effort SEO hors marketing ».
