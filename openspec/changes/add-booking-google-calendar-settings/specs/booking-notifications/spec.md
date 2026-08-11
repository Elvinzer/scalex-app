## ADDED Requirements

### Requirement: Notifications use the booking-specific meeting link

Les communications d'une réservation native SHALL utiliser le lien Meet snapshoté sur cette réservation lorsqu'il existe. Le lien vers l'événement Google Calendar SHALL rester distinct du lien de réunion, et une modification ultérieure de la configuration d'un événement SHALL ne pas réécrire le lien d'une réservation déjà confirmée.

#### Scenario: Confirmation email includes the generated Meet link

- **WHEN** une réservation native est confirmée avec un lien Google Meet
- **THEN** l'email de confirmation du prospect et la notification du closer contiennent ce lien de réunion ainsi que les informations calendaires utiles

#### Scenario: Reminder and ICS use the same Meet link

- **WHEN** un rappel est envoyé ou que le prospect télécharge le fichier `.ics` d'une réservation
- **THEN** le lien Meet utilisé correspond à celui enregistré sur cette réservation et non à un lien statique d'événement

#### Scenario: Existing manual event link remains compatible

- **WHEN** une ancienne réservation ne possède pas de lien Meet snapshoté mais que son événement possède encore un lien de réunion manuel
- **THEN** les surfaces de notification peuvent utiliser ce lien legacy sans casser l'historique existant
