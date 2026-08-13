## Purpose

Cette capacité permet à chaque closer de gérer plusieurs comptes Google pour la prise de rendez-vous, de choisir le compte qui reçoit les invitations et de sélectionner séparément les comptes dont le calendrier principal détecte les conflits.

## ADDED Requirements

### Requirement: Invited closers have personal calendar and booking visibility

Chaque closer SHALL utiliser son propre accès Minaly issu de l'invitation de l'équipe pour connecter ses comptes Google. L'autorisation Google SHALL être attachée à l'utilisateur authentifié ; une autre identité de closer ne SHALL pas pouvoir être fournie par le client pour créer ou modifier une connexion.

Pour un closer invité qui n'a pas de droit account-wide, le système SHALL exposer uniquement ses appels à venir et les liens de prise de rendez-vous des événements auxquels il est rattaché par la configuration de l'événement. Les événements, réservations et liens d'autres closers SHALL être exclus des listes, recherches, réponses d'API et accès directs. Les owners/admins ou utilisateurs disposant déjà du droit account-wide SHALL conserver la vue de gestion globale nécessaire à leurs permissions.

#### Scenario: Closer sees only their upcoming calls

- **WHEN** un closer invité ouvre son agenda de prise de rendez-vous
- **THEN** les rendez-vous affichés sont limités à ceux dont le closer est l'utilisateur connecté, sans rendez-vous d'un autre closer

#### Scenario: Closer sees links only for attached events

- **WHEN** un closer consulte la liste des événements et liens de prise de rendez-vous
- **THEN** il peut accéder aux liens des événements qui lui sont rattachés et les événements d'autres closers ne sont pas exposés

#### Scenario: Direct access cannot bypass closer scope

- **WHEN** un closer tente d'ouvrir directement l'URL, l'action serveur ou l'endpoint d'un événement, rendez-vous ou lien qui ne lui est pas rattaché
- **THEN** le serveur refuse l'accès ou retourne une ressource inexistante selon le contrat de la route, sans révéler les données de l'autre closer

#### Scenario: OAuth belongs to the authenticated closer

- **WHEN** un closer termine le flux OAuth Google depuis ses paramètres
- **THEN** la connexion est enregistrée pour son utilisateur Minaly et ne peut pas être utilisée pour configurer silencieusement le compte Google d'un autre closer

### Requirement: A closer can connect multiple Google accounts

Le système SHALL permettre à un closer autorisé de connecter plusieurs comptes Google Calendar simultanément. La connexion d'un nouveau compte SHALL ajouter une connexion sans remplacer les autres, et chaque connexion SHALL afficher l'adresse du compte, son état et une action de reconnexion ou de déconnexion.

#### Scenario: Closer adds a second Google account

- **WHEN** un closer termine l'autorisation d'un deuxième compte Google
- **THEN** les deux comptes apparaissent dans la liste des calendriers connectés et le premier compte reste utilisable

#### Scenario: Closer reconnects an existing Google account

- **WHEN** un closer reconnecte un compte Google déjà présent
- **THEN** la connexion existante est actualisée sans créer de doublon ni modifier les autres comptes connectés

### Requirement: Invitation target is selected independently

Le système SHALL permettre de sélectionner un seul compte Google pour créer les nouveaux événements et envoyer les invitations. Le calendrier cible SHALL être le calendrier principal de ce compte, résolu côté serveur ; un compte dont le calendrier principal n'est pas accessible en écriture SHALL être considéré comme non configuré.

#### Scenario: Closer selects the invitation target

- **WHEN** un closer choisit un compte Google cible et enregistre ses paramètres
- **THEN** les prochains rendez-vous attribués à ce closer sont créés dans ce compte et les rendez-vous existants conservent leur compte d'origine

#### Scenario: Invitation target is disconnected

- **WHEN** le compte Google sélectionné comme cible est déconnecté
- **THEN** le closer n'est plus prêt à recevoir de nouveaux rendez-vous et les réservations existantes restent accessibles sans être réattribuées

### Requirement: Conflict calendars are configured independently

Le système SHALL permettre de sélectionner un ou plusieurs comptes Google pour vérifier les conflits de disponibilité. Le calendrier principal de chaque compte sélectionné SHALL être utilisé automatiquement. Cette sélection SHALL être indépendante du compte cible des invitations et SHALL être prise en compte pour les futurs créneaux du closer.

#### Scenario: Closer checks several Google calendars

- **WHEN** un closer sélectionne plusieurs comptes Google
- **THEN** une période occupée dans le calendrier principal de l'un de ces comptes rend le closer indisponible sur le créneau chevauché

#### Scenario: Closer changes conflict calendars

- **WHEN** un closer retire un compte de la sélection des conflits
- **THEN** les nouveaux calculs de disponibilité ne consultent plus son calendrier principal, tandis que le compte cible d'invitation reste inchangé

### Requirement: Booking settings expose readiness and actionable recovery

La page de paramètres SHALL indiquer si le closer possède un compte cible, un calendrier cible accessible en écriture et au moins un calendrier de conflit. La page native `/ventes/rdv` SHALL afficher un avertissement actionnable lorsqu'un closer affecté à un événement actif ne possède pas cette configuration, avec un lien vers les paramètres de calendrier.

#### Scenario: Native booking page warns about missing calendar setup

- **WHEN** un closer affecté à un événement actif n'a pas de configuration Google complète
- **THEN** `/ventes/rdv` affiche un avertissement identifiant la configuration manquante et propose d'ouvrir les paramètres de calendrier

#### Scenario: Closer is ready for native bookings

- **WHEN** un closer possède un compte Google connecté, un calendrier cible accessible en écriture et un calendrier de conflit
- **THEN** son état de configuration est prêt et aucun avertissement de configuration ne lui est associé

### Requirement: Disconnecting a calendar preserves booking history

La déconnexion SHALL désactiver la connexion pour les nouvelles attributions sans supprimer l'historique des comptes utilisés par les réservations existantes. Les rendez-vous existants SHALL conserver leur closer, leur compte cible et leur lien externe lorsque ces informations sont disponibles.

#### Scenario: Disconnected account remains referenced by an existing booking

- **WHEN** un closer déconnecte un compte Google qui possède des rendez-vous déjà réservés
- **THEN** ces rendez-vous restent visibles avec leur compte d'origine et ne sont pas déplacés automatiquement vers un autre compte
