## Context

Le produit utilise `users.id` comme identité du compte propriétaire ; les membres d'équipe sont des délégations rattachées à ce compte. La facturation Scale X est séparée de Stripe Connect : `subscription_plans` contient le catalogue et `subscriptions` projette un seul abonnement par compte, tandis que Stripe conserve la vérité financière. Le webhook de facturation vérifie déjà la signature et déduplique les événements. L'accès fondateur repose sur `ADMIN_EMAILS` et les actions admin doivent refaire leur contrôle via `requireAdmin`.

La page `/settings/facturation` et le Billing Portal couvrent le parcours du client. La nouvelle surface est donc une console opérateur, pas un second espace de paiement. L'UI doit reprendre les tokens Scale X existants ; les recommandations génériques de dashboard dense servent uniquement à la hiérarchie et aux interactions.

## Goals / Non-Goals

**Goals:**

- Fournir une liste account-centric performante et une fiche de diagnostic exploitable.
- Garder la distinction entre projection locale, entitlements applicatifs et vérité financière Stripe.
- Rendre les actions V1 ré-exécutables, protégées et explicites : contexte Stripe, portail client, resynchronisation.
- Éviter toute incohérence de montant après une modification de catalogue.
- Préparer un parcours desktop dense et une représentation mobile lisible, accessible au clavier et aux lecteurs d'écran.

**Non-Goals:**

- Implémenter un back-office financier complet avec remboursements, coupons, prorata ou changements de plan forcés.
- Ajouter une impersonation client ou exposer des secrets Stripe au navigateur.
- Construire en V1 un historique complet des factures, un calcul de churn cohorté ou une comptabilité de revenus reconnue.

## Decisions

### 1. Projection locale pour la liste, Stripe à la demande pour les opérations

La liste et les KPIs courants lisent la projection Postgres afin d'éviter un appel Stripe par ligne et de rester utilisables si Stripe est temporairement indisponible. La fiche affiche la date de synchronisation et propose une resynchronisation explicite. Les liens Stripe et le Billing Portal sont générés uniquement à la demande côté serveur.

Alternative écartée : interroger Stripe pour toute la liste. Cette approche serait plus proche de la source de vérité mais trop lente, difficile à paginer correctement et fragile face aux limites API.

### 2. Requêtes account-centric avec jointure gauche

La requête de l'inventaire part des propriétaires `users` et joint facultativement `subscriptions` puis `subscription_plans`. Cela permet d'identifier les comptes sans abonnement et évite de confondre un membre d'équipe avec un client facturé. La recherche, les filtres, le tri et la pagination restent côté serveur et sont encodés dans l'URL.

### 3. Snapshot du Price sur l'abonnement

Ajouter à `subscriptions` une référence `stripePriceId` et un `priceMonthlyCents` nullable, alimentés depuis le premier item récurrent de la Subscription Stripe. `planId` continue de fournir le nom et les entitlements du catalogue ; le snapshot fournit le montant réellement souscrit. Une ligne historique sans snapshot affiche `À vérifier` jusqu'à une resynchronisation réussie.

Alternative écartée : afficher systématiquement `subscriptionPlans.priceMonthlyCents`. Elle masque les anciens montants après une évolution de prix et rend la console dangereusement trompeuse.

La migration est additive. Les lignes existantes ne sont pas inventées ni migrées aveuglément ; elles sont enrichies par resynchronisation Stripe, manuellement ou via un job de backfill ultérieur.

### 4. Limite stricte des actions financières en V1

Les actions locales ne modifient pas le cycle de vie Stripe. L'admin peut ouvrir le contexte Stripe, générer un portail client ou réconcilier la projection. Toute mutation financière reste dans Stripe, où les règles de prorata, de relance et d'autorisation existent déjà.

Alternative écartée : ajouter immédiatement annulation et changement de plan dans Scale X. Cela exigerait une politique de prorata, une journalisation d'audit, une gestion des erreurs partielles et des tests idempotents plus larges que le besoin V1.

### 5. Actions serveur protégées et re-exécutables

Chaque Server Action admin appelle `requireAdmin`, valide les identifiants avec Zod et effectue un upsert déterministe par compte. Les erreurs Stripe ne doivent jamais remplacer une projection valide par des données partielles. Les URLs de portail restent éphémères, ne sont ni persistées ni journalisées.

### 6. Hiérarchie UX data-dense mais calme

Le desktop utilise une table compacte avec recherche et filtres au-dessus ; la fiche regroupe l'état d'abonnement, les droits et l'usage en cartes courtes. Sous le breakpoint mobile, les lignes deviennent des cartes empilées. Les statuts ont toujours un libellé et, si utile, une icône en plus de la couleur. Les actions de grille restent en `outline` ; une seule action prioritaire par écran peut utiliser le CTA corail, tandis que les actions d'analyse restent dans le violet prévu par la DA.

## Risks / Trade-offs

- **[Projection obsolète]** → afficher la dernière synchronisation, fournir une resynchronisation explicite et conserver Stripe comme lien de référence.
- **[Price historique introuvable]** → afficher `À vérifier`, ne jamais substituer silencieusement le prix courant, puis enrichir par resynchronisation.
- **[Abus d'une action admin]** → vérifier la session dans chaque action, limiter les opérations répétées et ne jamais exposer de secret ou de données de paiement.
- **[Stripe indisponible]** → garder la dernière projection lisible, afficher l'erreur actionnable et ne pas écraser les champs existants avec `null`.
- **[Table illisible sur mobile]** → basculer vers des cartes, réduire les colonnes secondaires et conserver l'identité, le statut et l'action principale dans le premier écran.
- **[Données actuelles insuffisantes pour le churn]** → ne pas promettre ce KPI en V1 ; limiter les indicateurs aux états et montants observables dans la projection.

## Migration Plan

1. Ajouter les colonnes de snapshot Price et les index nécessaires de manière additive, avec RLS cohérente avec les tables existantes.
2. Adapter le checkout et les événements Stripe de création/mise à jour pour alimenter le snapshot ; traiter les payloads externes avec les validations prévues.
3. Ajouter les requêtes account-centric, la liste, les filtres URL et la fiche admin.
4. Ajouter les actions de contexte Stripe, Billing Portal et resynchronisation, puis vérifier les contrôles admin indépendants.
5. Reconciler progressivement les anciennes lignes ; laisser `À vérifier` tant qu'aucun Price historique fiable n'est obtenu.
6. Tester avec agent-browser sur desktop, 375 px et largeur intermédiaire, puis exécuter typecheck/lint et vérifier le diff de secrets avant livraison.

Le rollback fonctionnel consiste à masquer les nouvelles pages et actions ; les colonnes de snapshot peuvent rester nulles sans casser le checkout ou les gates existants. Aucune donnée Stripe ou abonnement existant ne doit être supprimé.
