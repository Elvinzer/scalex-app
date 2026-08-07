## Context

Le changement s'appuie sur la réconciliation existante décrite dans `reconcile-stripe-sales` : `sales` représente un deal et `installments` représente son échéancier. Les agrégats de `monthly_metrics` sont utiles au Dashboard, mais perdent le niveau transactionnel nécessaire pour comparer les remboursements, les échecs, les clients et les abonnements. La page App Router est dynamique, les mutations passent par des Server Actions sécurisées et les jobs externes passent par Inngest.

## Goals / Non-Goals

**Goals:**

- Maintenir une projection transactionnelle complète et idempotente du compte Stripe Connect courant.
- Calculer un snapshot analytique pur, testable sans base ni API externe, à partir de montants en unités mineures et d'une devise explicite.
- Fournir des signaux lisibles et actionnables, puis une formulation IA facultative sans déplacer les calculs hors du serveur.
- Réutiliser `Suivi des ventes`, les tokens DA existants, TanStack Charts, les primitives `KpiTile`/`Button` et les permissions account-scoped.
- Rendre visible la fraîcheur, les erreurs de synchronisation et les limites de données.

**Non-Goals:**

- Aucun webhook Stripe Connect temps réel dans cette tranche ; le rafraîchissement reste Inngest/manuel.
- Aucune conversion de devise ou agrégation USD/EUR.
- Aucun calcul de marge, de frais Stripe ou de profit tant qu'une source fiable de balance transactions n'est pas intégrée.
- Aucune attribution marketing déduite d'un paiement Stripe ; `sourceChannel` reste distincte de la provenance transactionnelle.
- Aucun accès en écriture au compte Stripe du client.

## Decisions

### 1. Séparer les transactions analytiques des deals commerciaux

Ajouter une table `stripe_transactions` avec une ligne par charge, account-scoped et unique sur `(user_id, stripe_account_id, stripe_charge_id)`. Elle conservera les identifiants externes utiles, le montant brut en cents, la devise, les dates, le customer, l'invoice/subscription lorsqu'ils sont connus, le statut, le montant remboursé, le type de paiement et les informations d'échec non sensibles.

Ajouter une table `stripe_transaction_refunds` avec une ligne par remboursement, unique sur `(user_id, stripe_account_id, stripe_refund_id)`, rattachée à la charge par `stripe_charge_id`. Cela permet de représenter les remboursements partiels et leur date réelle sans réécrire l'historique de la charge.

Alternative écartée : analyser directement `sales.installments`. Cette forme est correcte pour le reste à payer d'un deal, mais elle ne peut pas représenter une devise, un remboursement partiel, une date de remboursement distincte ou plusieurs transactions indépendantes sans déformer le modèle métier.

### 2. Réutiliser le cycle de vie `stripe_connections`

Ajouter `last_sync_started_at`, `last_sync_completed_at` et `last_sync_error` à `stripe_connections`, en conservant `initial_sync_status` pour l'état courant. Le job existant sera déclenché par la connexion et par un nouvel événement `stripe/sync.requested`. Un job cron quotidien enverra cet événement pour chaque connexion active ; une Server Action account-scoped permettra aussi un rafraîchissement manuel limité.

Chaque run relira la fenêtre historique de douze mois, puis fera des upserts idempotents. Cette fenêtre couvre les remboursements tardifs et reste acceptable pour la phase initiale ; le curseur incrémental pourra être ajouté lorsque le volume réel des comptes le justifiera.

### 3. Un snapshot pur comme frontière de confiance

`lib/stripe/transaction-insights.ts` recevra une liste de transactions normalisées, une liste de remboursements, une période et une devise. Il filtrera, grouppera et calculera tous les montants, taux, comparaisons et signaux sans DB, sans Stripe et sans `Date.now()` implicite. Les données de snapshot seront des nombres et libellés minimaux, sans emails ni noms de clients.

Les règles de signal auront des seuils explicites et des gardes d'échantillon. Une métrique non calculable sera `null` ou absente avec une raison ; elle ne sera jamais remplacée par zéro pour fabriquer un delta.

### 4. L'IA ne reformule que les faits

`lib/agent/stripe-insight.ts` reprendra le pattern de `lib/agent/insight.ts` : système court en français, limite de tokens, sortie texte, usage BYOK/shared retourné par `resolveAgentKey`. Le Server Action recalculera le snapshot depuis la base, validera la période/devise par Zod, puis enregistrera la génération dans `stripe_insight_runs` avec le snapshot, les signaux, la source de clé et les tokens. Une erreur IA n'empêchera jamais le rendu déterministe.

### 5. Surface UI intégrée à `Suivi des ventes`

Le Server Component de la page charge la connexion, les transactions de la devise sélectionnée et le snapshot. Le bloc client ne conservera que l'état d'interaction de la sélection et de la génération IA ; les valeurs affichées restent produites côté serveur.

La composition sera :

1. barre de contexte avec période, devise, fraîcheur et bouton outline de rafraîchissement ;
2. grille de KPI (net, transactions, remboursements, montant à risque) ;
3. courbe de tendance et comparaison simple, avec résumé texte et table alternative ;
4. cartes de signaux prioritaires avec preuve chiffrée et action ;
5. détail transactionnel compact sous la table de ventes existante.

Le CTA corail existant `Ajouter une vente` reste le CTA prioritaire. Le rafraîchissement reste `outline` et l'approfondissement IA utilise `variant="accent2"`. Aucun hexadécimal ni couleur Tailwind brute ne sera ajouté.

### 6. Autorisation et révalidation

La page et les Server Actions résoudront `getAccountContext` puis vérifieront `ventes:suivi`. Les requêtes filtreront simultanément par `userId/accountId` et `stripeAccountId` actif. Après une demande de synchronisation ou une génération, `revalidatePath("/ventes/suivi")` sera utilisé pour refléter l'état courant ; aucune donnée brute ne sera renvoyée à un composant client inutilement.

## Risks / Trade-offs

- **[Volume Stripe élevé]** → Relecture limitée à douze mois et upsert par identifiant ; mesurer la durée du job avant d'introduire un curseur.
- **[Remboursement tardif]** → Relecture de toute la fenêtre historique à chaque run ; la projection de remboursement reste indépendante de la charge.
- **[Devise non dominante]** → Pas de conversion implicite ; sélecteur et message explicite évitent les totaux faux.
- **[Erreur API sur invoice/subscription]** → Les champs facultatifs restent nuls ; la charge est conservée et classée avec les informations disponibles.
- **[Clé Anthropic invalide]** → Signaux déterministes rendus avant l'action IA ; l'erreur est localisée et non sensible.
- **[Risque de double vérité]** → `sales` reste le modèle de deal ; `stripe_transactions` ne remplace jamais la réconciliation ni les KPI contractés.

## Migration Plan

1. Ajouter les tables transactionnelles, la table d'historique IA, les colonnes de fraîcheur et les policies RLS dans `db/schema.ts`.
2. Générer la migration avec `npm run db:generate`, la relire, puis l'appliquer avec `npm run db:migrate`.
3. Déployer le code de synchronisation et le cron ; les anciens comptes sont backfillés au prochain run ou via le bouton de rafraîchissement.
4. En cas de rollback UI, conserver les tables et stopper la lecture de la surface ; en cas de rollback sync, les données réconciliées existantes restent intactes.

## Open Questions

Aucune question bloquante pour l'implémentation : la devise reste explicite sans FX et les frais Stripe restent hors périmètre jusqu'à l'ajout d'une source balance transaction fiable.
