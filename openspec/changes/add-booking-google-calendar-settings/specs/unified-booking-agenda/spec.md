## MODIFIED Requirements

### Requirement: Unified appointment sources are account-scoped

L'agenda SHALL afficher les rendez-vous provenant des réservations natives, d'iClosed et de Calendly pour le compte courant, sous réserve du périmètre de l'utilisateur connecté. Un closer invité sans droit account-wide SHALL recevoir uniquement les rendez-vous qui lui sont attribués ; les lignes d'un autre closer SHALL ne jamais être retournées par les lectures d'agenda, les filtres, la recherche ou les endpoints de détail. Les owners/admins ou utilisateurs disposant déjà du droit account-wide SHALL conserver la vue globale prévue par leurs permissions. Les appels manuels SHALL rester hors de cet agenda.

#### Scenario: Closer agenda is personally scoped

- **WHEN** un closer invité ouvre l'agenda dans une période contenant ses rendez-vous et ceux d'autres closers
- **THEN** seules ses propres lignes apparaissent, quelle que soit la vue Agenda, Semaine ou Liste et quels que soient les filtres choisis

#### Scenario: Server-side scope survives a crafted filter

- **WHEN** un closer ajoute dans l'URL ou la requête un identifiant d'un autre closer
- **THEN** la réponse reste limitée à son propre périmètre et ne révèle ni rendez-vous ni métadonnée de l'autre closer

#### Scenario: Authorized manager keeps account-wide agenda

- **WHEN** un owner, admin ou utilisateur disposant du droit account-wide ouvre l'agenda
- **THEN** il peut consulter les rendez-vous du compte selon les filtres de closers déjà autorisés

### Requirement: Native appointments expose authorized management actions

Les actions de consultation, déplacement et annulation des rendez-vous natifs SHALL vérifier côté serveur que l'utilisateur connecté possède le rendez-vous ou dispose du droit account-wide requis. Un closer SHALL pouvoir consulter et gérer ses propres rendez-vous selon les permissions existantes, mais ne SHALL pas muter le rendez-vous d'un autre closer.

#### Scenario: Closer cannot mutate another closer appointment

- **WHEN** un closer tente de déplacer ou d'annuler le rendez-vous natif d'un autre closer
- **THEN** l'action est refusée côté serveur et le rendez-vous reste inchangé

### Requirement: Agenda, week and list views are functional

Les vues filtrées par closer SHALL conserver les états de chargement, vide et erreur, avec un message expliquant le périmètre personnel lorsqu'aucun appel n'est présent. Les filtres non applicables à un closer invité SHALL être masqués ou ignorés côté serveur, sans donner l'impression qu'un autre closer peut être sélectionné.

#### Scenario: Closer has no upcoming appointment

- **WHEN** un closer correctement configuré n'a aucun rendez-vous dans la période sélectionnée
- **THEN** l'agenda affiche un état vide personnel et ne montre aucun indice permettant de déduire les rendez-vous d'autres closers
