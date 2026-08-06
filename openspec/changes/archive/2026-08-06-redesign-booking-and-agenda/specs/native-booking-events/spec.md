## ADDED Requirements

### Requirement: Event configuration includes qualification questions

La configuration d’un événement SHALL permettre de gérer ses questions de qualification selon la capacité `booking-qualification-questions`. Une modification de l’événement SHALL conserver l’ordre, les options, le caractère obligatoire et l’historique des réponses déjà enregistrées.

#### Scenario: Event editor saves questions with event settings

- **WHEN** un utilisateur autorisé ajoute une question puis enregistre l’événement
- **THEN** la question est disponible dans l’aperçu public et dans le parcours de réservation de cet événement uniquement

### Requirement: Event configuration includes reminder rules

La configuration d’un événement SHALL permettre de gérer ses règles de rappels email selon la capacité `booking-notifications`. Les rappels SHALL pouvoir être désactivés sans supprimer les rendez-vous ou les emails déjà envoyés.

#### Scenario: Event without reminders remains bookable

- **WHEN** un utilisateur désactive toutes les règles de rappel d’un événement actif
- **THEN** l’événement reste réservable et les emails de confirmation, annulation et déplacement restent distincts des rappels

### Requirement: Event configuration changes preserve existing appointments

Les modifications de questions, messages, rappels, disponibilité et closer pool SHALL préserver les rendez-vous natifs existants. Les règles nouvelles SHALL affecter les réservations ou rappels futurs selon leur contrat, sans réécrire les réponses historiques ni réattribuer un rendez-vous existant.

#### Scenario: Editing event settings does not rewrite a booking

- **WHEN** l’utilisateur modifie les questions ou les rappels après une réservation
- **THEN** l’horaire, le closer, l’attribution et les réponses du rendez-vous existant restent inchangés
