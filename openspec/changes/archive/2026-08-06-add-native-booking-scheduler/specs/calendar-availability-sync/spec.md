## Purpose

Cette capacité relie les calendriers Google et Outlook des closers aux événements natifs pour éviter les conflits et créer automatiquement le rendez-vous externe après une réservation confirmée.

## ADDED Requirements

### Requirement: Calendar connection per closer

Le système SHALL permettre à un closer autorisé de connecter un compte Google ou Outlook distinct de ses autres connexions Scale X. Il SHALL afficher l’état de la connexion, les erreurs de synchronisation et une action de reconnexion ou de déconnexion.

#### Scenario: Closer connects a supported calendar provider

- **WHEN** un closer termine l’autorisation Google ou Outlook et sélectionne au moins un calendrier à prendre en compte
- **THEN** la connexion est associée à ce closer et son état devient disponible pour les événements qui lui sont affectés

### Requirement: Busy periods exclude slots

Pour chaque closer connecté, le système SHALL exclure des créneaux les périodes occupées des calendriers sélectionnés, ainsi que les Rendez-vous déjà confirmés et les buffers de l’événement.

#### Scenario: External calendar appointment blocks a slot

- **WHEN** un closer possède un rendez-vous externe qui chevauche un créneau généré
- **THEN** ce closer n’est pas éligible à ce créneau et le rendez-vous n’est pas proposé si aucun autre closer ne peut le prendre

### Requirement: External event creation is idempotent

Lorsqu’une réservation native est confirmée, le système SHALL créer un événement dans le calendrier du closer attribué avec les informations nécessaires au closer et au prospect. Une nouvelle tentative pour la même réservation SHALL réutiliser ou retrouver l’événement externe existant sans créer de doublon.

#### Scenario: Retry after a provider timeout

- **WHEN** la création de l’événement externe expire puis est relancée pour la même réservation
- **THEN** le système ne crée qu’un seul événement externe et conserve son identifiant sur la réservation

### Requirement: Calendar sync failure is visible and recoverable

Si le calendrier ne peut pas être lu ou si l’événement externe ne peut pas être créé, le système SHALL conserver un état de synchronisation explicite, ne SHALL pas envoyer une confirmation trompeuse au prospect et SHALL permettre une nouvelle tentative automatique ou manuelle.

#### Scenario: Provider rejects event creation

- **WHEN** le fournisseur refuse la création de l’événement externe
- **THEN** le rendez-vous n’est pas présenté comme confirmé tant que la synchronisation n’est pas rétablie et l’administrateur voit l’erreur avec une action de récupération

### Requirement: Cancellation and rescheduling stay synchronized

Lorsqu’un rendez-vous natif est annulé ou déplacé via Scale X, le système SHALL mettre à jour ou annuler l’événement externe correspondant lorsque le fournisseur le permet. Les erreurs SHALL être signalées sans perdre l’état interne du rendez-vous.

#### Scenario: Native cancellation removes the external event

- **WHEN** un rendez-vous confirmé est annulé depuis Scale X
- **THEN** l’événement externe est annulé ou marqué comme annulé et le créneau redevient disponible selon les règles de l’événement
