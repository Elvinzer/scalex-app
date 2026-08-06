## Why

Les fondateurs Scale X disposent déjà d'un catalogue de plans et d'un Billing Portal client, mais ils ne peuvent pas piloter les abonnements de tous les comptes depuis une vue opérationnelle. Il manque une lecture fiable du statut, des droits réellement actifs et de l'usage pour répondre au support et détecter rapidement les comptes à risque, sans transformer Scale X en second Stripe.

Le changement de prix d'un plan crée déjà un nouveau Price Stripe, mais la projection locale ne conserve pas encore explicitement le prix réellement attaché aux abonnements existants. La console doit éviter d'afficher un montant trompeur.

## What Changes

- Ajouter une surface fondateurs `/admin/subscriptions` listant tous les comptes, y compris ceux sans abonnement.
- Ajouter recherche, filtres par statut/plan et vue responsive ; afficher compte, plan, montant, statut, échéance et annulation programmée.
- Ajouter une vue détail d'un compte avec abonnement, entitlements, membres d'équipe, usage de réservation et identifiants de synchronisation utiles.
- Ajouter au dashboard admin les accès explicites vers abonnements et plans, en conservant la séparation avec le parrainage.
- Ajouter des opérations sûres : ouvrir le contexte Stripe, générer un lien Billing Portal destiné au client et resynchroniser la projection locale depuis Stripe.
- Utiliser Stripe comme source de vérité financière et rendre les opérations de synchronisation idempotentes et protégées par `requireAdmin`.
- Préserver le prix réellement souscrit lors des évolutions de catalogue, ou rendre explicite la version de Price affichée pour un abonnement existant.
- Ne pas ajouter en V1 de remboursement, annulation immédiate, changement de plan forcé, impersonation ou modification financière directe depuis Scale X.

## Capabilities

### New Capabilities

- `admin-subscription-console`: lecture opérationnelle des abonnements, recherche, filtres, détails, entitlements, usage et navigation admin.
- `admin-subscription-operations`: liens opérateur/client et resynchronisation sûre avec Stripe, avec contrôle d'accès et états de feedback.
- `subscription-price-integrity`: cohérence entre les Prices Stripe historiques, les abonnements existants et les montants affichés dans Scale X.

### Modified Capabilities

- Aucune spécification existante de facturation dans `openspec/specs/` à modifier.

## Impact

- Nouvelles pages et composants sous `app/admin/`.
- Nouvelles requêtes/actions serveur pour les comptes, abonnements, plans, entitlements et usages.
- Extension possible de `db/schema.ts` et d'une migration Drizzle pour conserver la référence ou le snapshot du Price souscrit.
- Utilisation du client Stripe plateforme pour les liens et la resynchronisation ; aucun accès Stripe Connect du client ne doit être utilisé.
- Vérification indépendante de l'accès admin sur chaque Server Action, validation Zod des entrées et tests d'interface avec agent-browser sur desktop et mobile.
