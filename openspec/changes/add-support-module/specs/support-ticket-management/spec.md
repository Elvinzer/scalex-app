## Purpose

Donner à Minaly une file de support interne fiable, séparée des permissions des comptes clients, afin que les fondateurs et futurs agents puissent trier, faire évoluer, documenter et clôturer les demandes sans accéder aux autres fonctions sensibles de l'administration.

## ADDED Requirements

### Requirement: Support access is a dedicated internal permission

Le système SHALL définir une permission interne `support:tickets` et un rôle `support_agent` qui n'accorde que l'accès au module support. Cette permission MUST NOT être ajoutée aux rôles d'équipe client existants.

#### Scenario: Founder opens the support console

- **WHEN** un fondateur autorisé ouvre la console support
- **THEN** il peut consulter et administrer les tickets selon ses droits fondateur actuels

#### Scenario: Support agent opens the support console

- **WHEN** un membre interne actif avec le rôle `support_agent` ouvre `/admin/support`
- **THEN** il peut accéder à la file et aux actions support autorisées
- **AND** il ne peut pas accéder aux pages d'abonnements, de plans, aux clés API, aux données Stripe ou à l'impersonation

#### Scenario: Customer team member opens the support console

- **WHEN** un membre d'équipe d'un compte client tente d'ouvrir `/admin/support`
- **THEN** l'accès Admin lui est refusé même s'il possède des permissions métier dans son compte

### Requirement: Support console provides an operational queue

La console SHALL être accessible sous `/admin/support` et fournir une liste filtrable par statut, type, priorité, assignation, date et recherche textuelle sur la référence, le titre ou l'identité du demandeur.

#### Scenario: Agent filters tickets awaiting triage

- **WHEN** un agent sélectionne le filtre de triage
- **THEN** la liste affiche uniquement les tickets correspondants, avec leur référence, type, titre, demandeur, page, priorité, statut, assignation et date de dernière activité

#### Scenario: Queue has no matching ticket

- **WHEN** les filtres actifs ne correspondent à aucun ticket
- **THEN** la console affiche un état vide explicite et permet de réinitialiser les filtres

#### Scenario: Agent opens a ticket detail

- **WHEN** un agent sélectionne une ligne de la file
- **THEN** la fiche affiche le contenu complet, le contexte technique, la capture disponible, l'historique, les messages publics et les notes internes auxquels il est autorisé à accéder

### Requirement: Ticket lifecycle can be managed explicitly

Le support SHALL pouvoir modifier le statut, la priorité et l'assignation d'un ticket. Les statuts internes MUST couvrir `new`, `triage`, `in_progress`, `waiting_on_user`, `resolved`, `closed`, `duplicate` et `declined`.

#### Scenario: New ticket is triaged

- **WHEN** un agent ouvre un ticket `new` et le passe en triage avec une priorité
- **THEN** le ticket conserve l'acteur, la date, l'ancien statut, le nouveau statut et la priorité dans son historique

#### Scenario: Ticket waits for the user

- **WHEN** le support demande une information complémentaire et passe le ticket en attente utilisateur
- **THEN** le statut public est affiché comme « En attente de ta réponse » et le ticket peut recevoir un message public du demandeur

#### Scenario: Resolved ticket receives a user reply

- **WHEN** le demandeur ajoute un message à un ticket `resolved` ou `waiting_on_user`
- **THEN** le ticket revient en triage et le nouveau message est ajouté à l'historique public

#### Scenario: Ticket is marked as duplicate

- **WHEN** un agent marque un ticket comme doublon
- **THEN** il doit pouvoir référencer le ticket canonique et la relation est visible dans la fiche

### Requirement: Public messages and internal notes are separated

La fiche SHALL permettre au support de rédiger un message public ou une note interne. La visibilité MUST être stockée avec chaque entrée et ne doit pas pouvoir être modifiée implicitement par le frontend.

#### Scenario: Agent writes an internal note

- **WHEN** un agent ajoute une note interne
- **THEN** la note apparaît à l'équipe support, n'est pas visible à l'utilisateur et est enregistrée dans l'historique avec son auteur

#### Scenario: Agent sends a public reply

- **WHEN** un agent ajoute une réponse publique
- **THEN** le demandeur autorisé peut la lire dans `/support` et le ticket reçoit une nouvelle activité

### Requirement: Support actions protect customer data

Chaque page, action serveur et route de la console SHALL vérifier indépendamment l'identité interne et la permission effective. Les écrans support MUST NOT exposer les secrets BYOK, tokens, clés Stripe ou données qui ne sont pas nécessaires au traitement du ticket.

#### Scenario: Support agent calls a protected action directly

- **WHEN** un agent sans permission suffisante appelle directement une action de modification par son endpoint
- **THEN** l'action est refusée côté serveur même si l'interface n'affiche pas le bouton

#### Scenario: Ticket context contains sensitive data

- **WHEN** la fiche Admin affiche le contexte technique d'un ticket
- **THEN** les paramètres sensibles sont masqués ou absents, y compris dans les logs d'erreur
