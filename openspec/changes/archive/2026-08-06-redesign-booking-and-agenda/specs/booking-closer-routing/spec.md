## ADDED Requirements

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
