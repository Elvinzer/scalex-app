# booking-notifications Specification

## Purpose

Cette capacité orchestre les communications liées à un rendez-vous natif : confirmation, annulation, déplacement, rappels email prospect personnalisables et fichier `.ics`, avec des envois fiables et cohérents avec l’état réel du rendez-vous.

## Requirements

### Requirement: Prospect receives transactional booking emails

Le système SHALL pouvoir envoyer au prospect un email de confirmation, d’annulation et de déplacement pour un rendez-vous natif. Chaque email SHALL refléter l’état et l’horaire courants, inclure le fuseau, le closer et les liens disponibles, et ne SHALL pas être envoyé pour un rendez-vous iClosed ou Calendly depuis ce flux natif.

#### Scenario: Native booking sends confirmation to prospect

- **WHEN** une réservation native est confirmée avec une adresse email valide
- **THEN** le prospect reçoit un email de confirmation contenant l’événement, la date, l’heure, le fuseau, le closer et les options de gestion disponibles

#### Scenario: Native cancellation sends cancellation email

- **WHEN** un rendez-vous natif est annulé
- **THEN** le prospect reçoit un email indiquant l’annulation et aucun rappel futur de ce rendez-vous ne reste actif

### Requirement: Confirmation exposes an iCalendar download

La confirmation publique SHALL proposer un fichier `.ics` téléchargeable pour le rendez-vous natif. Le fichier SHALL contenir l’heure de début et de fin en UTC, le fuseau lisible, le titre de l’événement, le closer, les consignes et le lien de réunion lorsqu’il existe.

#### Scenario: Prospect downloads an iCalendar file

- **WHEN** le prospect clique sur « Ajouter à l’agenda » après une réservation confirmée
- **THEN** un fichier `.ics` correspondant à l’instant réservé est téléchargé sans exposer de token de gestion dans le fichier

### Requirement: Event defines multiple reminder rules

Un utilisateur autorisé SHALL pouvoir définir zéro, une ou plusieurs règles de rappel email par événement. Chaque règle SHALL contenir un délai positif avant le début, un message personnalisable et un état actif/inactif. Les règles SHALL être affichées dans l’ordre chronologique d’envoi et les délais identiques SHALL être refusés.

#### Scenario: User configures two reminders

- **WHEN** l’utilisateur configure un rappel deux heures avant et un autre une heure avant
- **THEN** les deux règles sont enregistrées, prévisualisables et planifiées dans cet ordre pour les nouvelles réservations

### Requirement: Reminder messages support approved variables

Les messages de rappel SHALL accepter au minimum les variables prénom, événement, date, heure, fuseau, lien de réunion et lien de gestion. Une variable inconnue SHALL être refusée ou signalée avant l’enregistrement et ne SHALL jamais être rendue brute dans un email envoyé.

#### Scenario: Reminder renders booking context

- **WHEN** un rappel utilise les variables de date et de lien de gestion
- **THEN** l’email envoyé contient les valeurs du rendez-vous concerné dans le fuseau du rendez-vous

### Requirement: Reminder lifecycle follows appointment state

Les rappels SHALL être idempotents et envoyés au prospect uniquement. Si l’échéance est déjà dépassée au moment de la réservation, le rappel SHALL être envoyé immédiatement au plus une fois. Une annulation SHALL supprimer les rappels non envoyés. Un déplacement SHALL recalculer les échéances restantes à partir du nouvel horaire et des règles courantes.

#### Scenario: Late booking sends an immediate reminder

- **WHEN** un prospect réserve un rendez-vous moins de deux heures avant son début alors qu’une règle est configurée à deux heures
- **THEN** le rappel est envoyé immédiatement au plus une fois, puis les autres rappels futurs restent planifiés

#### Scenario: Reschedule rebuilds pending reminders

- **WHEN** un rendez-vous est déplacé
- **THEN** les rappels non envoyés utilisent le nouvel horaire et la configuration courante, sans réexpédier un rappel déjà envoyé

### Requirement: Reminder configuration changes affect pending future sends

Une modification des règles d’un événement SHALL s’appliquer aux nouvelles réservations et aux rappels non envoyés des rendez-vous futurs. Les messages déjà envoyés SHALL rester inchangés. Une règle désactivée SHALL empêcher tout envoi futur correspondant.

#### Scenario: User edits a pending reminder message

- **WHEN** l’utilisateur modifie le message d’un rappel avant son échéance
- **THEN** le prochain envoi utilise le nouveau message et les rappels déjà envoyés ne sont pas réécrits

### Requirement: WhatsApp remains a manual prefilled action

Le système SHALL fournir, lorsque le numéro est disponible, un lien WhatsApp prérempli destiné à la relance manuelle. Le message V1 SHALL rester fixe et accepter les variables prénom, événement et date. Le système ne SHALL pas envoyer automatiquement de message WhatsApp.

#### Scenario: Closer opens WhatsApp follow-up

- **WHEN** le closer clique sur WhatsApp depuis une relance ou une fiche native
- **THEN** le navigateur ouvre une conversation avec le numéro normalisé et le message prérempli sans envoyer le message automatiquement
