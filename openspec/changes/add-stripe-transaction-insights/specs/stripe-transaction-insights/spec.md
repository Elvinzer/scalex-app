## Purpose

Cette capacité transforme les paiements Stripe Connect synchronisés en faits analytiques fiables et en insights actionnables, sans confondre la réalité transactionnelle avec les deals commerciaux ni laisser un modèle de langage calculer les chiffres.

## ADDED Requirements

### Requirement: Stripe Connect scope and account isolation

Le système SHALL lire et analyser exclusivement le compte Stripe Connect associé au compte Minaly courant. Il SHALL NOT lire le Stripe Billing de Minaly, le système de parrainage, ni exposer une transaction d'un autre compte. Toutes les lectures, écritures et actions SHALL être account-scoped côté serveur et protégées par RLS.

#### Scenario: Connected account transaction is accepted

- **WHEN** une charge ou un remboursement est lu depuis le client read-only du compte Connect de l'utilisateur
- **THEN** l'événement peut alimenter les données transactionnelles et les insights de ce compte uniquement

#### Scenario: Minaly billing is excluded

- **WHEN** un paiement concerne l'abonnement Minaly interne
- **THEN** il n'est présent dans aucune transaction ni aucun insight du client

#### Scenario: Cross-account access is attempted

- **WHEN** un utilisateur demande une transaction, un snapshot ou un insight avec un identifiant appartenant à un autre compte
- **THEN** le serveur ne renvoie aucune donnée et n'effectue aucune mutation

### Requirement: Transactional Stripe projection

Le système SHALL conserver une projection normalisée des charges Stripe et de leurs remboursements, avec l'identifiant du compte Connect, l'identifiant Stripe, la date, le montant en unités mineures, la devise ISO, le customer, la facture, le moyen de paiement, le type récurrent ou one-shot, le statut, les informations d'échec et les montants remboursés lorsque Stripe les fournit. Les données sensibles de carte et les secrets SHALL NOT être stockés.

#### Scenario: Successful charge is projected

- **WHEN** une charge réussie du compte Connect est synchronisée
- **THEN** une transaction account-scoped avec son montant, sa devise, sa date et son customer est disponible pour les agrégations

#### Scenario: Failed charge is projected

- **WHEN** une charge échouée est synchronisée
- **THEN** elle est conservée avec son statut et sa raison exploitable, sans être comptée dans le CA encaissé

#### Scenario: Refund is projected

- **WHEN** un remboursement total ou partiel est synchronisé
- **THEN** le remboursement est rattaché à la charge concernée et son montant/date sont disponibles pour l'analyse

### Requirement: Idempotent and refreshable synchronization

La synchronisation SHALL être sûre à rejouer. Une charge ou un remboursement déjà projeté SHALL être mis à jour sans duplication. Le système SHALL permettre un premier backfill de la fenêtre historique configurée et un rafraîchissement ultérieur manuel ou planifié, avec un état `pending`, `completed` ou `failed`, une date de dernière réussite et un message d'erreur non sensible.

#### Scenario: Replaying the same charge

- **WHEN** un job relit une charge dont l'identifiant Stripe existe déjà pour ce compte
- **THEN** il met à jour la projection si nécessaire et ne crée aucune deuxième transaction

#### Scenario: Manual refresh succeeds

- **WHEN** un utilisateur autorisé lance un rafraîchissement Stripe
- **THEN** le job est déclenché pour son compte, l'état de fraîcheur est visible, puis les nouveaux chiffres sont disponibles après réussite

#### Scenario: Refresh fails

- **WHEN** Stripe est temporairement indisponible ou renvoie une erreur non récupérable
- **THEN** les données précédemment synchronisées restent lisibles, l'état passe à `failed`, et l'interface propose de réessayer sans afficher de secret

### Requirement: Currency integrity

Le système SHALL conserver la devise de chaque transaction et SHALL NOT additionner des montants de devises différentes ni appliquer un taux de change implicite. Un snapshot SHALL être calculé pour une devise explicite, ou refuser le calcul global lorsqu'aucune devise unique n'est sélectionnée.

#### Scenario: Single-currency snapshot

- **WHEN** toutes les transactions de la période sont en USD
- **THEN** les KPI, graphiques et montants d'insight sont calculés en USD et affichent cette devise

#### Scenario: Multi-currency account

- **WHEN** une période contient des transactions en USD et EUR
- **THEN** le système propose une vue par devise ou demande une devise, et aucun total USD+EUR n'est affiché comme un montant unique

### Requirement: Deterministic analytics snapshot

Le système SHALL calculer côté serveur un snapshot numérique versionné pour une période et une devise. Le snapshot SHALL contenir au minimum : CA brut, remboursements, CA net après remboursements, nombre de transactions réussies, nombre de paiements échoués, montant à risque, part récurrente, clients uniques, clients récurrents, ticket moyen et évolution par rapport à la période comparable précédente. Les dénominateurs nuls ou échantillons insuffisants SHALL produire `null` ou un état explicite plutôt qu'un pourcentage trompeur.

#### Scenario: Revenue trend is computed

- **WHEN** deux périodes comparables contiennent des transactions dans la même devise
- **THEN** le snapshot expose le CA de chaque période, le delta absolu et le delta relatif calculés en code

#### Scenario: No comparable data exists

- **WHEN** la période précédente ne contient aucune donnée comparable
- **THEN** le delta est `null` et l'interface indique qu'il n'y a pas encore de base de comparaison

#### Scenario: Risk amount is computed

- **WHEN** des paiements échoués ou des montants prévus existent dans la période
- **THEN** le snapshot expose séparément le nombre et le montant à risque, sans les inclure dans le CA encaissé

### Requirement: Actionable insight candidates

Le système SHALL produire des signaux déterministes à partir du snapshot pour les tendances de revenu, les remboursements, les échecs de paiement, la récurrence, les clients récurrents et la concentration du chiffre. Chaque signal SHALL inclure un type, une priorité, une explication lisible, les valeurs sources et une action ou destination pertinente. Aucun signal SHALL être fondé uniquement sur une couleur ou sur une inférence d'attribution non mesurée.

#### Scenario: Refund signal is shown

- **WHEN** le taux de remboursement dépasse le seuil métier configuré et que le volume minimal est atteint
- **THEN** un signal indique le taux, le montant concerné et une action de vérification des offres ou du parcours de vente

#### Scenario: Recurring revenue signal is shown

- **WHEN** des transactions d'abonnement existent dans la période
- **THEN** un signal indique la part récurrente et distingue clairement les revenus one-shot des prélèvements récurrents

#### Scenario: Insufficient sample is handled

- **WHEN** le nombre de transactions est trop faible pour une conclusion fiable
- **THEN** le signal est omis ou marqué comme observation insuffisante et aucune recommandation catégorique n'est affichée

### Requirement: Optional AI wording from computed facts

La génération IA SHALL être optionnelle et ne SHALL recevoir qu'un snapshot validé, des signaux déterministes et les chiffres nécessaires, jamais une clé Stripe, un secret, ni une liste brute de clients. Elle SHALL utiliser en priorité la clé BYOK du compte puis le fallback partagé selon la configuration existante, journaliser la source de clé et les tokens, et ne SHALL pas empêcher l'affichage des insights déterministes en cas d'échec.

#### Scenario: User asks for a deeper explanation

- **WHEN** l'utilisateur autorisé demande une explication IA d'un signal
- **THEN** le serveur génère une formulation courte et actionnable à partir du snapshot, l'enregistre avec sa consommation et la renvoie au compte courant

#### Scenario: AI generation fails

- **WHEN** la clé est absente, invalide ou le fournisseur échoue
- **THEN** les faits et signaux déterministes restent disponibles et l'interface affiche une erreur récupérable sans exposer la clé ou le prompt interne

### Requirement: Sales page insight surface

La page `Suivi des ventes` SHALL afficher une surface `Insights Stripe` lorsque des données synchronisées sont disponibles. Elle SHALL afficher la devise et la fraîcheur, les KPI, une tendance temporelle, des comparaisons lisibles, les signaux prioritaires et une table de données accessible. Elle SHALL proposer un état vide, un état de synchronisation et un état d'erreur avec récupération.

#### Scenario: Synchronized data is available

- **WHEN** une synchronisation réussie fournit au moins une transaction pour la période
- **THEN** les KPI, la courbe et les signaux sont visibles dans `Suivi des ventes` sans ajouter une nouvelle entrée de navigation obligatoire

#### Scenario: No transaction data exists

- **WHEN** Stripe est connecté mais aucune transaction n'existe dans la période
- **THEN** la page explique pourquoi l'analyse est vide et propose de modifier la période ou de rafraîchir Stripe

#### Scenario: Narrow viewport

- **WHEN** la page est consultée à 375 px
- **THEN** les cartes s'empilent, les graphiques se simplifient ou reflowent, aucun contenu essentiel ne déborde horizontalement, et chaque contrôle reste activable

### Requirement: Accessible and safe interaction states

Les contrôles de période, devise, rafraîchissement, filtres, détails et génération IA SHALL être navigables au clavier, nommés pour les lecteurs d'écran, dotés d'un focus visible et d'un retour de chargement/erreur annoncé. Les graphiques SHALL avoir un résumé textuel et une alternative tabulaire. Les animations SHALL respecter `prefers-reduced-motion`.

#### Scenario: Keyboard user reaches insight action

- **WHEN** un utilisateur navigue au clavier jusqu'à une carte d'insight
- **THEN** il peut comprendre la preuve chiffrée, atteindre l'action et obtenir un retour de succès ou d'erreur sans hover

#### Scenario: Reduced motion is enabled

- **WHEN** le navigateur demande la réduction des animations
- **THEN** les données restent immédiatement lisibles et les transitions décoratives sont supprimées ou réduites
