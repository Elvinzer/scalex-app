## Purpose

Cette capacité connecte un compte publicitaire Meta à un compte Scale X en lecture, de façon révocable et explicite, expose l'état de la connexion et de la synchronisation sans jamais masquer une dégradation, et n'obtient une permission d'écriture qu'au moment où l'utilisateur en a besoin.

## ADDED Requirements

### Requirement: Initial connection requests read scope only

Le système SHALL demander `ads_read` uniquement lors de la connexion initiale. Le système SHALL NOT demander `ads_management` tant que l'utilisateur n'a pas engagé une action directe. Le scope réellement accordé SHALL être persisté et lisible.

#### Scenario: User connects for the first time

- **WHEN** l'utilisateur autorise Scale X dans la fenêtre Meta
- **THEN** seule la permission de lecture est demandée, et Scale X indique qu'aucune modification de son compte publicitaire n'est possible à ce stade

#### Scenario: Read scope is granted but write scope is absent

- **WHEN** l'application vérifie les capacités disponibles
- **THEN** les surfaces d'action directe affichent qu'une autorisation supplémentaire sera demandée au moment d'appliquer, sans bloquer la lecture

### Requirement: Write scope is obtained through an explicit step-up

Le système SHALL demander `ads_management` par un consentement séparé, déclenché par la première action directe. Ce consentement SHALL indiquer ce qu'il autorise, sur quel compte, et comment le révoquer.

#### Scenario: User applies an action for the first time

- **WHEN** l'utilisateur confirme vouloir appliquer une action et que le scope d'écriture est absent
- **THEN** Scale X affiche l'écran de step-up avant toute confirmation d'exécution, et l'action reprend là où elle était après l'autorisation

#### Scenario: User declines the step-up

- **WHEN** l'utilisateur refuse la permission d'écriture
- **THEN** l'action bascule sur `Ouvrir dans Meta Ads`, la connexion en lecture reste intacte et aucune donnée n'est perdue

### Requirement: Connection is consented before any redirect

Le système SHALL afficher, avant toute redirection vers Meta, la raison de la connexion, les données lues, la permission demandée et le fait qu'aucune écriture n'est possible à ce stade.

#### Scenario: User opens the consent modal

- **WHEN** l'utilisateur clique sur `Connecter Meta Ads`
- **THEN** Scale X affiche les données lues et la permission demandée avant tout appel à Meta

#### Scenario: User cancels the consent modal

- **WHEN** l'utilisateur ferme le modal sans continuer
- **THEN** aucune requête OAuth n'est émise et aucun état de connexion n'est persisté

### Requirement: The ad account is never selected silently

Le système SHALL demander une sélection explicite du compte publicitaire, y compris lorsqu'un seul compte est accessible. La liste SHALL afficher le nom, l'identifiant masqué, la devise, le fuseau horaire et le statut d'accès de chaque compte.

#### Scenario: Several accounts are available

- **WHEN** le callback Meta renvoie plusieurs comptes publicitaires
- **THEN** Scale X affiche la liste sans présélection et le bouton `Continuer` reste inactif tant qu'aucun compte n'est choisi

#### Scenario: A single account is available

- **WHEN** un seul compte publicitaire est accessible
- **THEN** Scale X demande quand même une sélection explicite avant de persister le compte principal

#### Scenario: An account cannot be read

- **WHEN** un compte est visible mais sans accès en lecture
- **THEN** il est listé, non sélectionnable, accompagné du motif du refus

### Requirement: Connection state is always legible

Le système SHALL exposer l'état courant parmi non connecté, redirection en cours, retour réussi, erreur d'autorisation, permission refusée, aucun compte publicitaire, connecté en lecture, connecté avec écriture autorisée. Chaque état d'erreur SHALL indiquer quoi faire ensuite et proposer l'action correspondante.

#### Scenario: Authorization is refused at Meta

- **WHEN** l'utilisateur refuse l'autorisation dans la fenêtre Meta
- **THEN** Scale X affiche la cause en clair et propose de relancer la connexion, sans persister de connexion partielle

#### Scenario: No ad account is reachable

- **WHEN** le compte Meta autorisé n'expose aucun compte publicitaire
- **THEN** Scale X l'indique explicitement et propose de vérifier les accès dans le Business Manager

### Requirement: A connected account exposes its identity and freshness

Le système SHALL afficher le nom du compte, son identifiant masqué, sa devise, la date du dernier sync, le statut de synchronisation et le scope accordé, avec les actions `Rafraîchir maintenant`, `Changer de compte` et `Déconnecter`.

#### Scenario: User switches account

- **WHEN** l'utilisateur choisit `Changer de compte`
- **THEN** Scale X repasse par la sélection explicite et conserve l'historique déjà synchronisé du compte précédent jusqu'à confirmation

#### Scenario: User disconnects

- **WHEN** l'utilisateur choisit `Déconnecter`
- **THEN** les tokens sont révoqués et supprimés, et Scale X indique ce qui reste consultable et ce qui ne sera plus mis à jour

### Requirement: Degraded states never delete already-read data

Le système SHALL gérer token expiré, permission supprimée, synchronisation échouée, données partielles et compte inaccessible. Une dégradation SHALL dater et qualifier les données existantes plutôt que les effacer ou les remplacer par des zéros.

#### Scenario: Token expires

- **WHEN** le token d'accès expire
- **THEN** Scale X affiche `Reconnecter Meta Ads`, conserve les données déjà synchronisées et les marque avec leur date de dernière fraîcheur

#### Scenario: Write permission is revoked at Meta

- **WHEN** `ads_management` est retirée côté Meta alors que la lecture reste valide
- **THEN** Scale X continue de lire, signale que les actions directes ne sont plus disponibles et propose un nouveau step-up

#### Scenario: Partial sync

- **WHEN** une synchronisation ne récupère qu'une partie de la période
- **THEN** Scale X indique les jours manquants et expose la couverture, sans compléter par des valeurs nulles
