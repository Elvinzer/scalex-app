## Purpose

Cette capacité donne à Scale X une mémoire account-scoped des recommandations actionnables et transforme une décision utilisateur en initiative reliée au Journal, sans créer un CRM ou une file de tâches parallèle.

## ADDED Requirements

### Requirement: Actionable insights are retained with their source context

Le système SHALL conserver un record normalisé pour chaque insight actionnable matérialisé par le Diagnostic, le Funnel, un levier structuré, une recommandation de contenu ou une conversation ayant produit une action explicite. Le record SHALL conserver sa source, son texte, sa date, sa période et le snapshot de données présenté au moment de la recommandation.

#### Scenario: A structured diagnostic insight enters history

- **WHEN** un utilisateur ouvre ou accepte une recommandation Diagnostic qui possède une action explicite
- **THEN** Scale X crée ou retrouve un record account-scoped avec la recommandation, sa métrique, sa période et son impact estimé sans créer de doublon pour le même snapshot

#### Scenario: Re-reading an insight does not create a duplicate

- **WHEN** la même recommandation est affichée plusieurs fois sans changement de source, période ou métrique
- **THEN** l’historique conserve un seul record identifiable et la date de dernière consultation ne modifie pas son contenu de référence

### Requirement: Insight history exposes a decision lifecycle

Chaque record SHALL exposer un statut de décision lisible au minimum parmi `à traiter`, `lancé`, `plus tard`, `écarté` et `terminé`. Le statut SHALL être account-scoped, persistant et distinct du statut technique de la source d’origine.

#### Scenario: User defers an insight

- **WHEN** l’utilisateur choisit `Plus tard`
- **THEN** le record reste visible dans l’historique avec sa recommandation et sa date de reprise éventuelle, mais ne devient pas la priorité hebdomadaire sans action explicite

#### Scenario: User dismisses an irrelevant insight

- **WHEN** l’utilisateur choisit `Écarter`
- **THEN** l’insight disparaît des priorités courantes, reste consultable dans l’historique et n’est pas reproposé par Falco tant qu’il n’est pas réactivé manuellement

### Requirement: User can launch an insight into the Journal

Le système SHALL proposer `Je lance cette action` pour un insight actionnable. Cette action SHALL créer ou lier une initiative et une cible Journal de type tâche ou projet, avec une échéance facultative, sans demander à l’utilisateur de recopier le conseil.

#### Scenario: Launch creates a linked business task

- **WHEN** l’utilisateur lance un insight court et confirme une échéance
- **THEN** Scale X crée une tâche Journal marquée comme amélioration business, crée l’initiative liée et affiche le lien retour vers l’insight

#### Scenario: Launch links an existing project

- **WHEN** l’utilisateur choisit un projet Journal existant
- **THEN** l’initiative est liée à ce projet sans créer une seconde copie du projet et sa progression apparaît dans le Journal

#### Scenario: Launch is idempotent

- **WHEN** l’utilisateur double-clique ou recharge après avoir lancé le même insight
- **THEN** Scale X conserve une seule initiative active liée à cet insight et ne crée pas de tâche ou projet en double

### Requirement: The account has one weekly business priority

Le système SHALL permettre de sélectionner au plus une initiative comme priorité business active pour un compte et une semaine ISO donnés. Remplacer la priorité SHALL conserver l’initiative précédente dans l’historique avec son état courant.

#### Scenario: User selects the weekly priority

- **WHEN** l’utilisateur choisit une initiative comme priorité de la semaine
- **THEN** le Dashboard, le Journal et l’historique affichent la même priorité et aucune autre initiative n’est marquée priorité pour cette semaine

#### Scenario: Concurrent focus selection

- **WHEN** deux requêtes tentent de sélectionner des priorités différentes pour le même compte et la même semaine
- **THEN** une seule sélection est conservée selon une règle transactionnelle déterministe et aucune double priorité n’est affichée

### Requirement: Improvement initiatives can be assigned within the account

Le propriétaire SHALL pouvoir assigner une initiative à un membre d’équipe actif du même compte. Une personne assignée SHALL pouvoir consulter et mettre à jour l’initiative uniquement si elle possède les permissions nécessaires à la surface source ; aucune assignation ne SHALL accorder de permission supplémentaire.

#### Scenario: Owner assigns an initiative to an active member

- **WHEN** le propriétaire sélectionne un membre actif du compte
- **THEN** l’initiative affiche ce responsable et le membre peut la retrouver dans sa file autorisée

#### Scenario: Assignment cannot cross account boundaries

- **WHEN** une requête tente d’assigner une initiative à un `team_member` d’un autre compte ou supprimé
- **THEN** la mutation est rejetée et aucun identifiant ou nom de l’autre compte n’est renvoyé

### Requirement: Journal remains the execution surface

Les transitions significatives d’une initiative SHALL alimenter les événements du Journal, mais le Journal SHALL rester une projection d’activité et ne SHALL pas devenir la source de vérité du statut de l’insight ou de l’initiative.

#### Scenario: Completing a linked task records an improvement event

- **WHEN** une tâche liée à une initiative est terminée
- **THEN** le Journal affiche un événement d’amélioration lié à l’initiative et l’initiative passe à l’état correspondant sans perdre l’insight d’origine
