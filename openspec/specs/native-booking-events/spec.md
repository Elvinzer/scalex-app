# native-booking-events Specification

## Purpose
Cette capacité permet à un compte Minaly de créer et publier des événements de réservation natifs avec leurs horaires, exceptions, limites, fuseau horaire et état de disponibilité.
## Requirements
### Requirement: Event lifecycle and public identity

Le système SHALL permettre à un utilisateur autorisé de créer un événement avec un nom, une durée, un fuseau horaire IANA et un identifiant public unique. Un événement SHALL avoir au minimum les états brouillon, actif et en pause. Seul un événement actif SHALL exposer des créneaux réservables publiquement.

#### Scenario: Draft event is not bookable

- **WHEN** un visiteur ouvre le lien public d’un événement en brouillon
- **THEN** le système n’affiche aucun créneau et indique que la page n’est pas encore disponible

#### Scenario: Pausing an event hides future slots

- **WHEN** un utilisateur met un événement actif en pause
- **THEN** les nouvelles recherches de disponibilité ne retournent aucun créneau, tandis que les rendez-vous déjà confirmés restent inchangés

### Requirement: Recurring availability rules

Le système SHALL permettre de définir plusieurs plages récurrentes par jour de la semaine. Il SHALL appliquer la durée de l’événement, les buffers avant et après rendez-vous, le délai minimal de réservation et l’horizon maximal de réservation pour calculer les créneaux.

#### Scenario: Slots respect the weekly schedule and buffers

- **WHEN** un événement est ouvert le lundi de 09:00 à 12:00 avec une durée de 30 minutes et un buffer de 15 minutes
- **THEN** les créneaux proposés restent entièrement dans cette plage et deux réservations successives sont séparées par le buffer configuré

### Requirement: Date exceptions

Le système SHALL permettre de fermer une date précise ou de remplacer ses horaires récurrents par une ou plusieurs plages personnalisées. Une exception SHALL primer sur la disponibilité hebdomadaire.

#### Scenario: Closed date overrides recurring availability

- **WHEN** une date normalement ouverte est marquée comme indisponible
- **THEN** aucun créneau de cette date n’est proposé publiquement

### Requirement: Event timezone is authoritative

Le système SHALL interpréter les règles de disponibilité et les exceptions dans le fuseau horaire de l’événement. Les rendez-vous SHALL conserver leur instant absolu et le fuseau de l’événement utilisé lors de la réservation.

#### Scenario: Availability crosses a daylight-saving transition

- **WHEN** une plage récurrente couvre une date de changement d’heure
- **THEN** les créneaux sont calculés selon les règles locales du fuseau de l’événement sans décalage manuel d’une heure

### Requirement: Activation readiness

Le système SHALL empêcher l’activation d’un événement qui ne possède pas au moins une plage valide, une durée valide et un closer éligible. L’espace administrateur SHALL indiquer les prérequis manquants et fournir un accès direct à leur configuration.

#### Scenario: Incomplete event cannot be activated

- **WHEN** un utilisateur tente d’activer un événement sans disponibilité configurée
- **THEN** l’activation est refusée et le panneau affiche une erreur actionnable identifiant la disponibilité manquante

### Requirement: Public link management

Le système SHALL fournir un lien public stable pour chaque événement actif, avec une action permettant de le copier et une action permettant d’ouvrir un aperçu public. La désactivation ou la mise en pause SHALL rendre le lien non réservables sans modifier son identifiant.

#### Scenario: Copying and opening the public link

- **WHEN** un utilisateur clique sur copier le lien puis sur aperçu
- **THEN** le lien copié correspond à l’identifiant public de l’événement et l’aperçu ouvre le même parcours que celui accessible à un prospect

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
