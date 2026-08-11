## MODIFIED Requirements

### Requirement: Booking confirmation is atomic

Le système SHALL revalider le créneau, les exceptions, les limites, l'absence de rendez-vous futur, l'éligibilité du closer et sa configuration Google au moment de la confirmation. Il SHALL créer ou retrouver l'événement Google cible et la conférence Meet avant de retourner une confirmation complète au prospect. Si l'une de ces conditions échoue ou si la génération du Meet reste non résolue, aucun rendez-vous ne SHALL être présenté comme pleinement confirmé avec un lien de réunion absent ; le prospect SHALL pouvoir réessayer ou choisir un autre créneau selon l'état interne conservé.

#### Scenario: Slot is taken during confirmation

- **WHEN** un autre prospect réserve le créneau avant la confirmation finale
- **THEN** la confirmation échoue avec un message de créneau indisponible et le calendrier recharge les alternatives disponibles

#### Scenario: Closer loses Google readiness before confirmation

- **WHEN** le closer sélectionné perd son compte cible Google ou son calendrier accessible en écriture avant la confirmation
- **THEN** la réservation échoue de façon récupérable, aucun lien Meet invalide n'est retourné et le créneau peut être reproposé selon les closers encore prêts

#### Scenario: Confirmation returns the generated meeting link

- **WHEN** l'événement Google et la conférence Meet sont créés avec succès
- **THEN** la réponse publique contient le lien Meet propre à la réservation, son lien de gestion et les horaires confirmés

## ADDED Requirements

### Requirement: Public confirmation exposes the booking-specific meeting link

Après une réservation native confirmée et synchronisée, la page publique SHALL afficher le lien Google Meet généré pour cette réservation. Ce lien SHALL rester associé à la réservation lors de l'ouverture du lien de gestion et d'un déplacement du rendez-vous.

#### Scenario: Prospect joins the confirmed call

- **WHEN** le prospect arrive sur la confirmation d'une réservation synchronisée
- **THEN** il peut ouvrir le lien Google Meet correspondant au rendez-vous sans utiliser le lien interne de l'événement Google Calendar
