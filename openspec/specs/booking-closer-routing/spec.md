# booking-closer-routing Specification

## Purpose
Cette capacité attribue chaque réservation à un closer réellement éligible, de façon équilibrée et persistée, afin que les équipes commerciales puissent travailler en round robin sans double attribution.
## Requirements
### Requirement: Event closer pool

Le système SHALL permettre à un utilisateur autorisé d’associer un ou plusieurs closers actifs à un événement. Un closer désactivé, retiré de l’équipe ou explicitement mis hors disponibilité SHALL être exclu des nouvelles attributions.

#### Scenario: Removing a closer affects future assignments only

- **WHEN** un closer est retiré d’un événement qui possède déjà des rendez-vous confirmés
- **THEN** ses rendez-vous existants conservent leur attribution et il n’est plus sélectionné pour les nouveaux créneaux

### Requirement: Round robin assignment

Lorsque le round robin est activé, le système SHALL sélectionner les closers éligibles selon une rotation persistée par événement. L’attribution SHALL être enregistrée avec la réservation avant de confirmer celle-ci.

#### Scenario: Eligible closers rotate across bookings

- **WHEN** trois réservations successives sont confirmées sur un événement avec trois closers tous disponibles
- **THEN** les réservations sont attribuées à des closers différents selon l’ordre de rotation configuré

### Requirement: Final availability check during assignment

Le système SHALL vérifier la disponibilité réelle du closer sélectionné au moment de la confirmation. Si ce closer devient indisponible, le système SHALL essayer un autre closer éligible pour le même créneau ; s’il n’en existe aucun, la réservation SHALL être refusée avec une proposition de choisir un autre créneau.

#### Scenario: Selected closer becomes busy before confirmation

- **WHEN** le closer choisi par la rotation devient occupé avant la confirmation du prospect
- **THEN** le système attribue le créneau à un autre closer libre ou refuse la réservation si aucun closer n’est disponible

### Requirement: No overlapping assigned appointments

Le système SHALL empêcher qu’un même closer possède deux Rendez-vous confirmés qui se chevauchent, y compris lorsque plusieurs prospects confirment simultanément le même créneau.

#### Scenario: Concurrent confirmations compete for one closer

- **WHEN** deux prospects confirment simultanément un créneau qui ne peut être attribué qu’à un closer
- **THEN** une seule réservation est confirmée pour ce closer et l’autre reçoit une erreur de créneau devenu indisponible

### Requirement: Native rescheduling preserves the assigned closer

Le déplacement d’un rendez-vous natif SHALL conserver le closer actuellement attribué et ne SHALL jamais sélectionner un autre closer comme solution de repli. Les créneaux proposés SHALL exclure les conflits du closer courant, respecter les règles de l’événement et conserver l’historique du rendez-vous.

#### Scenario: Same closer has suggested availability

- **WHEN** l’utilisateur ouvre le déplacement d’un rendez-vous natif
- **THEN** les créneaux proposés appartiennent au closer déjà attribué et la confirmation conserve cette attribution

#### Scenario: Same closer has no slot on requested date

- **WHEN** le closer courant n’a aucun créneau libre à la date demandée
- **THEN** le système refuse le déplacement vers cette date, propose une autre date pour ce même closer et ne bascule pas vers un autre closer

### Requirement: Rescheduling does not consume round-robin assignment

Un déplacement natif SHALL ne SHALL pas avancer, réinitialiser ou consommer le curseur de round-robin. Une annulation SHALL libérer le créneau sans modifier les attributions historiques.

#### Scenario: Reschedule leaves next assignment unchanged

- **WHEN** un rendez-vous est déplacé avec succès
- **THEN** la prochaine nouvelle réservation suit le même prochain closer qu’avant le déplacement

### Requirement: Rebalance never reassigns existing appointments

L’action de rééquilibrage SHALL pouvoir modifier uniquement l’ordre ou le curseur utilisé pour de futures réservations. Elle SHALL conserver le closer, l’horaire, l’historique et les événements de calendrier de tous les rendez-vous déjà existants.

#### Scenario: User rebalances an event with future bookings

- **WHEN** l’utilisateur déclenche « Rééquilibrer » sur un événement possédant des rendez-vous futurs
- **THEN** aucun rendez-vous existant n’est déplacé ou réattribué et seules les futures attributions peuvent suivre le nouvel ordre
