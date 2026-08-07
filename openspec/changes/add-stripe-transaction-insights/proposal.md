## Why

Le suivi des ventes réconcilie déjà les paiements Stripe avec les deals, mais il ne permet pas encore de comprendre la dynamique du revenu au niveau transactionnel. Les agrégats mensuels et les échéances ne suffisent pas pour expliquer les tendances, les remboursements, les abonnements, les clients récurrents ou les montants à risque ; cette capacité ajoute une source analytique fiable et une surface d'insights exploitable.

## What Changes

- Conserver `sales` comme source de vérité du deal et ajouter une projection transactionnelle Stripe account-scoped, idempotente par compte Connect et identifiant Stripe.
- Synchroniser les charges, remboursements, échecs, abonnements et clients nécessaires à l'analyse, sans lire le Stripe Billing de Scale X.
- Calculer en code les métriques et signaux d'insight : évolution du CA, transactions, remboursements, échecs, montant à risque, récurrence, clients récurrents et concentration.
- Gérer explicitement les devises : aucune somme inter-devises ni conversion FX implicite ; la devise dominante est sélectionnée ou les données sont présentées séparément.
- Ajouter une synchronisation ré-exécutable après connexion et un rafraîchissement manuel ou planifié, avec état de fraîcheur visible.
- Ajouter une surface `Insights Stripe` dans `Suivi des ventes`, responsive et accessible, avec courbe, comparaisons, cartes d'insights et tableau de données.
- Permettre une reformulation IA optionnelle à partir d'un snapshot numérique calculé, avec BYOK/shared, quota et journalisation des tokens existants.
- Ajouter les tests unitaires de calcul/synchronisation et les scénarios agent-browser pour les états protégés, vides, chargés, en erreur et responsive.

## Capabilities

### New Capabilities

- `stripe-transaction-insights`: synchronisation transactionnelle, agrégations déterministes, signaux d'insight, reformulation IA optionnelle et interface de lecture.

### Modified Capabilities

Aucune spécification principale existante ne couvre actuellement le suivi Stripe transactionnel ; la réconciliation `sales` existante reste inchangée comme contrat métier.

## Impact

- Données sensibles : `db/schema.ts`, migration Drizzle et policies RLS.
- Stripe Connect : `lib/stripe/`, client read-only, synchronisation Inngest et état de connexion.
- Analyse : nouveaux modules de calcul account-scoped et tests unitaires.
- Agent : nouveau contrat de snapshot sans PII, réutilisant la résolution de clé et la journalisation BYOK/shared.
- Produit : `app/(app)/ventes/suivi/`, composants de graphiques/tableaux et éventuellement une action de rafraîchissement.
- Validation : `npm run typecheck`, `npm run lint`, tests Vitest et parcours agent-browser aux largeurs 375, 768, 1024 et 1440 px.
