## 1. Modèle de données (zone sensible db/schema.ts)

- [x] 1.1 Ajouter la colonne `bookingHandle` (`booking_handle text`) sur `users` dans `db/schema.ts`
- [x] 1.2 Ajouter un index unique partiel sur `booking_handle` (`WHERE booking_handle IS NOT NULL`)
- [x] 1.3 Générer et appliquer la migration Drizzle (`db:push`/migrate), vérifier RLS `users` inchangée
- [x] 1.4 Script de backfill : générer un handle pour chaque compte ayant déjà des `native_booking_events`

## 2. Logique de handle

- [x] 2.1 `lib/native-booking/handle.ts` : `slugifyHandle()` (minuscules, sans accent, `a-z0-9-`, 3–40)
- [x] 2.2 Liste de mots réservés (`admin`, `api`, `ics`, `book`, `auth`, `onboarding`, `invite`, `r`) + helper `isReservedHandle()`
- [x] 2.3 `generateAccountHandle()` : businessName → email local-part → jeton aléatoire, avec suffixe `-N` et retry sur violation d'unicité
- [x] 2.4 Schéma Zod de validation du handle (format + réservés) pour l'édition
- [x] 2.5 Hook de génération lazy : à la création du premier event de booking d'un compte sans handle

## 3. Résolution publique

- [x] 3.1 Adapter `getPublicNativeBookingEvent` et dérivés (`lib/native-booking/queries.ts`) pour prendre `(handle, slug)` via JOIN `users.booking_handle`
- [x] 3.2 Adapter les mutations/lookups by-token (`lib/native-booking/mutations.ts`, leads, tokens) au namespacing
- [x] 3.3 Retirer le `.limit(1)` ambigu au profit de la résolution `(handle, slug)`

## 4. Routes

- [x] 4.1 Faire retourner le `handle` du propriétaire par `getPublicNativeBookingEvent` (JOIN `users`) et l'exposer dans le type d'event public
- [x] 4.2 Créer `app/book/[handle]/[slug]/page.tsx` (déplacer l'existant), passer `handle` en prop au composant client
- [x] 4.3 Réécrire les 11 fetch `/api/public/booking/${event.slug}` + le href ICS de `public-booking-page.tsx` en `${handle}/${slug}`
- [x] 4.4 Transformer `app/book/[slug]/page.tsx` en shim 301 vers `/book/{handle}/{slug}` (préserver `searchParams`)
- [x] 4.5 Créer `app/api/public/booking/[handle]/[slug]/route.ts` et `.../ics/route.ts`
- [x] 4.6 Transformer l'ancienne route API `[slug]` en shim de redirect
- [x] 4.7 Gérer le not-found (handle inconnu / slug d'un autre compte / event non actif) → 404 propre
- [x] 4.8 `robots: { index: false, follow: false }` (metadata Next) sur la page `/book/[handle]/[slug]` et sur le shim `/book/[slug]`

## 5. Liens émis + UI d'édition

- [x] 5.1 Mettre à jour les générateurs de liens : `ventes/rdv/page.tsx`, `ventes/rdv/[eventId]/page.tsx`, `lib/native-booking/notifications.ts`, `lib/native-booking/reminders.ts`, `CopyLinkButton`
- [x] 5.2 UI d'édition du handle dans les réglages de l'event de booking (validation unicité + réservés + avertissement « casse les anciens liens »)
- [x] 5.3 Server action de mise à jour du handle (auth session côté serveur, validation Zod, contrainte d'unicité)

## 6. Vérification

- [x] 6.1 `npm run typecheck` et `npm run lint` passent
- [x] 6.2 Test manuel : nouveau lien namespacé résout ; ancien lien redirige 301 ; collision de slug entre 2 comptes résout correctement
- [x] 6.3 Vérifier ICS et e-mails de rappel/notification pointent vers l'URL namespacée
- [x] 6.4 `openspec validate booking-account-handle-urls --strict` passe
