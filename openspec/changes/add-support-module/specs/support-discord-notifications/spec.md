## Purpose

Alerter l'équipe Minaly dans Discord lorsqu'un ticket nécessite son attention, tout en conservant la donnée complète, le suivi et la capacité de reprise dans le module support natif.

## ADDED Requirements

### Requirement: New tickets notify the support Discord channel

À la création d'un ticket, le serveur SHALL envoyer une notification Discord contenant au minimum la référence, le type, le titre, le demandeur, le compte, la page courante, le statut, la priorité, la description, le contexte technique utile et un lien vers la fiche Admin.

#### Scenario: Ticket notification succeeds

- **WHEN** un ticket valide est créé et que Discord accepte le message
- **THEN** le ticket conserve l'identifiant du message Discord et l'état de notification `sent`

#### Scenario: Notification includes a capture

- **WHEN** le ticket possède une capture privée
- **THEN** la notification indique qu'une capture est disponible et fournit un accès sécurisé via la fiche Admin sans exposer un chemin de stockage interne

### Requirement: Discord credentials remain server-only

L'URL du webhook SHALL être lue depuis une variable d'environnement server-only. Elle MUST NOT apparaître ni dans le frontend, ni dans les logs, ni dans les messages d'erreur renvoyés à l'utilisateur, ni dans les artefacts OpenSpec.

#### Scenario: Client inspects the support form

- **WHEN** l'utilisateur consulte le code ou les requêtes du navigateur liées au support
- **THEN** aucun token ou URL complète du webhook Discord n'est présent

#### Scenario: User content contains a Discord mention

- **WHEN** le titre ou la description contient `@everyone`, `@here`, une mention de rôle ou une mention utilisateur
- **THEN** le message est neutralisé pour empêcher une notification Discord non souhaitée

### Requirement: Notification failures do not lose tickets

Le ticket SHALL être enregistré avant la tentative de notification. Un échec, timeout ou rate limit Discord MUST NOT annuler la création du ticket ni exposer une erreur technique sensible au demandeur.

#### Scenario: Discord is unavailable during submission

- **WHEN** la création du ticket réussit mais que Discord ne répond pas ou renvoie une erreur
- **THEN** l'utilisateur reçoit la référence du ticket, le ticket est marqué `notification_failed` ou `notification_pending` et la console permet une nouvelle tentative

#### Scenario: Agent retries a failed notification

- **WHEN** un agent autorisé demande une nouvelle tentative
- **THEN** le serveur réutilise le ticket existant, n'en crée pas un second et met à jour l'état de livraison avec le résultat de la tentative

### Requirement: Public activity can alert support without exposing internal notes

Une nouvelle réponse publique du demandeur SHALL pouvoir déclencher une notification Discord liée à la référence existante. Les notes internes et les changements purement internes MUST NOT générer de contenu client dans Discord.

#### Scenario: User adds public context

- **WHEN** un demandeur ajoute un message public à son ticket
- **THEN** Discord reçoit une alerte courte liée à la référence du ticket et la file Admin affiche le ticket comme récemment actif

#### Scenario: Agent writes an internal note

- **WHEN** un agent ajoute une note interne
- **THEN** aucune donnée de cette note n'est envoyée dans la notification destinée au channel support
