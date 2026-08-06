## Why

Les liens de réservation natifs sont de la forme `/book/{slug}` et sont résolus **par slug seul**, alors que le slug n'est unique que par compte (`unique(user_id, slug)`). Deux clients qui nomment leur événement `demo-appel-strategique` partagent donc la même URL publique, et la résolution en attrape un au hasard (`.limit(1)`) — collision latente qui se déclenche mécaniquement à mesure que la base grandit. On veut, comme iClosed, des liens namespacés par compte (`/book/{handle}/{slug}`), ce qui supprime l'ambiguïté et donne une URL brandée par client.

## What Changes

- Ajout d'un **handle de compte** URL-safe, unique globalement, porté par le compte propriétaire (colonne `booking_handle` sur `users`).
- Génération **lazy** du handle à la première création d'un événement de booking, dérivée du `businessName` (fallback local-part de l'email), avec suffixe numérique en cas de collision. Pas de nouvelle étape ajoutée au wizard d'onboarding.
- Nouvelle route publique `/book/{handle}/{slug}` (et route API `/api/public/booking/{handle}/{slug}`, y compris le sous-endpoint `ics`). La résolution publique passe d'un filtre `slug` seul à un JOIN `users.booking_handle = ? AND event.slug = ?`.
- **BREAKING (atténué)** : l'ancienne route `/book/{slug}` devient un **redirect 301** vers `/book/{handle}/{slug}`, pour ne casser aucun lien déjà envoyé (emails de rappel, notifications). Si une collision résiduelle existe, le shim loggue un warning et sert le premier event actif.
- Édition du handle depuis les réglages de l'événement de booking, avec validation d'unicité + liste de mots réservés.
- Mise à jour de tous les générateurs de liens internes (`ventes/rdv/page.tsx`, `ventes/rdv/[eventId]/page.tsx`, `lib/native-booking/notifications.ts`, `lib/native-booking/reminders.ts`, `CopyLinkButton`).
- Passage des pages `/book/*` en `noindex, nofollow` (pages transactionnelles par-client, aucun objectif SEO).

## Capabilities

### New Capabilities
- `booking-account-handle`: Le handle de compte URL-safe, sa génération, son unicité globale, son édition et les règles de validation (format, mots réservés).
- `public-booking-url`: Le contrat d'URL publique des liens de réservation namespacés par handle, sa résolution, et la rétrocompatibilité des anciens liens `/book/{slug}`.

### Modified Capabilities
<!-- Aucune capability spec existante dans openspec/specs/ ne couvre le booking natif ; le comportement actuel n'est pas encore spécifié. On introduit donc deux nouvelles capabilities plutôt que de modifier un delta inexistant. -->

## Impact

- **DB** (`db/schema.ts`, zone sensible) : nouvelle colonne `booking_handle` sur `users` + index unique partiel (`WHERE booking_handle IS NOT NULL`). RLS de `users` inchangée. Migration Drizzle + backfill des comptes ayant déjà des événements de booking.
- **Routing** : arborescence `app/book/[slug]/` → `app/book/[handle]/[slug]/` (+ shim de redirect sur l'ancienne), idem `app/api/public/booking/[slug]/` → `[handle]/[slug]/` et son sous-dossier `ics`.
- **Résolution** : `lib/native-booking/queries.ts` (`getPublicNativeBookingEvent` et dérivés) prend désormais `(handle, slug)`.
- **Liens sortants** : notifications e-mail, rappels, UI agenda/event, bouton copier-le-lien.
- Pas de webhook Stripe ni de `lib/agent/` touchés. Pas de nouvelle dépendance.
