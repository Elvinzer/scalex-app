## MODIFIED Requirements

### Requirement: Calendar connection per closer

Le système SHALL permettre à un closer autorisé de connecter un ou plusieurs comptes Google Calendar distincts. Chaque connexion SHALL afficher son état, ses erreurs de synchronisation et une action de reconnexion ou de déconnexion. Une connexion Outlook existante peut rester disponible, mais elle ne SHALL pas satisfaire à elle seule la readiness requise pour recevoir de nouveaux rendez-vous natifs.

#### Scenario: Closer connects several supported Google accounts

- **WHEN** un closer termine l'autorisation de plusieurs comptes Google
- **THEN** chaque connexion est conservée séparément et les paramètres de prise de rendez-vous peuvent en sélectionner une comme cible

#### Scenario: Google connection is incomplete

- **WHEN** une connexion Google est révoquée, nécessite une reconnexion ou n'a pas de calendrier cible accessible en écriture
- **THEN** elle est exclue des connexions utilisables pour les nouveaux rendez-vous et son état de récupération est visible au closer

### Requirement: Busy periods exclude slots

Pour chaque closer prêt, le système SHALL exclure des créneaux les périodes occupées des calendriers principaux des comptes Google sélectionnés pour les conflits, les rendez-vous déjà confirmés et les buffers de l'événement. Le compte cible des invitations SHALL être consulté uniquement s'il fait aussi partie de la sélection des conflits.

#### Scenario: Selected conflict calendar blocks a slot

- **WHEN** le calendrier principal d'un compte Google sélectionné pour les conflits contient un événement qui chevauche un créneau
- **THEN** le closer n'est pas éligible à ce créneau et celui-ci n'est pas proposé si aucun autre closer ne peut le prendre

#### Scenario: Unselected calendar does not block a slot

- **WHEN** un événement existe dans un calendrier Google secondaire ou dans le calendrier principal d'un compte non sélectionné pour les conflits
- **THEN** cet événement n'est pas utilisé pour exclure le closer de ce créneau

### Requirement: External event creation is idempotent

Lorsqu'une réservation native est confirmée, le système SHALL créer un événement dans le calendrier principal du compte cible Google du closer attribué, ajouter le prospect comme invité lorsque son email est disponible et demander une conférence Google Meet unique. Une nouvelle tentative pour la même réservation SHALL réutiliser ou retrouver l'événement et la conférence externes existants sans créer de doublon.

#### Scenario: Google target creates a Calendar event and Meet link

- **WHEN** une réservation est confirmée pour un closer prêt dont le compte cible est Google
- **THEN** un événement est créé dans le calendrier cible avec les horaires, le prospect invité et un lien Google Meet associé à cette réservation

#### Scenario: Retry after Google provider timeout

- **WHEN** la création Google expire puis est relancée pour la même réservation
- **THEN** le système retrouve l'événement externe déterministe, conserve un seul lien Meet et n'envoie pas une seconde invitation

### Requirement: Calendar sync failure is visible and recoverable

Si un calendrier ne peut pas être lu, si l'événement Google ne peut pas être créé ou si la génération du Meet échoue, le système SHALL conserver un état de synchronisation explicite, ne SHALL pas présenter au prospect une confirmation complète avec un lien Meet absent et SHALL permettre une nouvelle tentative automatique ou manuelle.

#### Scenario: Google Meet generation remains pending

- **WHEN** Google a créé l'événement mais indique que la conférence est encore en cours de génération
- **THEN** la réservation reste dans un état récupérable, le système programme une reprise et le prospect ne reçoit pas un lien Meet inventé ou périmé

#### Scenario: Google rejects event creation

- **WHEN** Google refuse la création de l'événement ou de la conférence
- **THEN** le rendez-vous n'est pas présenté comme pleinement confirmé au prospect, l'administrateur voit l'erreur et peut relancer la synchronisation

### Requirement: Cancellation and rescheduling stay synchronized

Lorsqu'un rendez-vous natif est annulé ou déplacé via Minaly, le système SHALL mettre à jour ou annuler l'événement Google Calendar correspondant lorsque le fournisseur le permet. Le lien Meet existant SHALL rester attaché au même événement lors d'un simple déplacement ; les erreurs SHALL être signalées sans perdre l'état interne du rendez-vous.

#### Scenario: Native cancellation removes the external event

- **WHEN** un rendez-vous confirmé est annulé depuis Minaly
- **THEN** l'événement Google externe est annulé ou marqué comme annulé, et le créneau redevient disponible selon les règles de l'événement

#### Scenario: Native reschedule keeps the conference

- **WHEN** un rendez-vous confirmé est déplacé vers un autre créneau
- **THEN** le même événement Google et son lien Meet sont mis à jour avec le nouvel horaire, sans créer une deuxième conférence
