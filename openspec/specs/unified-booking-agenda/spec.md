# unified-booking-agenda Specification

## Purpose

Cette capacité fournit une vue opérationnelle unique des rendez-vous natifs, iClosed et Calendly, tout en respectant les droits de modification propres aux rendez-vous natifs et les contraintes d’affichage d’un agenda dense.

## Requirements

### Requirement: Unified appointment sources are account-scoped

L’agenda SHALL afficher les rendez-vous provenant des réservations natives, d’iClosed et de Calendly pour le compte courant. Les appels manuels SHALL rester hors de cet agenda. Une ligne ou un détail d’un autre compte SHALL ne jamais être retourné.

#### Scenario: All supported sources appear together

- **WHEN** un compte possède des rendez-vous natifs, iClosed et Calendly dans la période sélectionnée
- **THEN** l’agenda affiche les trois sources dans une même vue avec leur libellé de source

#### Scenario: Manual call is not an agenda appointment

- **WHEN** un compte possède un appel manuel enregistré dans le suivi des appels
- **THEN** cet appel n’apparaît pas dans l’agenda unifié

### Requirement: Source and duration distinctions are visible

Chaque rendez-vous SHALL afficher une distinction textuelle et visuelle de sa source, sans utiliser la couleur comme seul signal. La durée native SHALL provenir du rendez-vous. Pour iClosed ou Calendly, la durée SHALL être optionnelle ; lorsqu’elle est absente, l’affichage SHALL utiliser une durée visuelle de 30 minutes sans modifier les données source.

#### Scenario: External appointment has no duration

- **WHEN** un rendez-vous iClosed ou Calendly ne possède pas de durée exploitable
- **THEN** l’agenda affiche une plage visuelle de 30 minutes, indique la source et ne présente pas cette durée comme une donnée confirmée par l’intégration

### Requirement: Agenda, week and list views are functional

L’utilisateur SHALL pouvoir basculer entre les vues `Agenda`, `Semaine` et `Liste`. Les trois vues SHALL afficher les mêmes résultats filtrés, proposer les états de chargement, vide et erreur, et conserver le rendez-vous sélectionné lors du changement de vue lorsque celui-ci reste dans le résultat.

#### Scenario: View switch preserves filters

- **WHEN** l’utilisateur passe de la vue Agenda à la vue Semaine
- **THEN** les filtres de closers, de statut et de période restent appliqués et l’URL reste partageable

#### Scenario: Empty filtered view is actionable

- **WHEN** aucun rendez-vous ne correspond aux filtres actifs
- **THEN** la vue affiche un état vide expliquant les filtres concernés et fournit une action pour les réinitialiser

### Requirement: Filters are combinable and deep-linkable

Les filtres de closer, source, statut et période SHALL être combinables. Leur état SHALL être synchronisé dans l’URL, restauré au rafraîchissement et validé côté serveur avant la lecture des données.

#### Scenario: Combined filters narrow the agenda

- **WHEN** l’utilisateur sélectionne un closer, la source Calendly et une période
- **THEN** seules les lignes correspondant aux trois contraintes sont affichées

### Requirement: Back-office dates use the viewer timezone

Les dates et heures des vues du back-office SHALL être formatées dans le fuseau du navigateur ou de l’utilisateur connecté. Le changement de fuseau d’affichage SHALL modifier les libellés et regroupements visibles sans modifier les instants UTC stockés.

#### Scenario: Appointment crosses a local day boundary

- **WHEN** un rendez-vous stocké en UTC tombe un jour différent dans le fuseau du navigateur
- **THEN** il est regroupé et affiché selon le jour local du navigateur, avec un libellé de fuseau accessible

### Requirement: External appointments are read-only

Les rendez-vous iClosed et Calendly SHALL proposer uniquement des actions de consultation dans l’agenda. Les actions de déplacement et d’annulation SHALL être absentes ou explicitement désactivées pour ces sources.

#### Scenario: External appointment has no mutation action

- **WHEN** l’utilisateur ouvre le menu d’un rendez-vous iClosed ou Calendly
- **THEN** il peut ouvrir la fiche et les informations disponibles, mais ne peut ni déplacer ni annuler le rendez-vous depuis Scale X

### Requirement: Native appointments expose authorized management actions

Les rendez-vous natifs SHALL proposer la consultation de la fiche, le déplacement et l’annulation aux utilisateurs autorisés. Le déplacement SHALL présenter des créneaux du même closer avant l’action de confirmation.

#### Scenario: Native appointment opens management drawer

- **WHEN** l’utilisateur ouvre la fiche d’un rendez-vous natif
- **THEN** le drawer affiche le prospect, l’événement, le closer, l’horaire, le fuseau, les réponses disponibles, la source et les actions autorisées

### Requirement: Agenda is responsive and keyboard operable

Les vues SHALL rester utilisables à 390 px, 768 px, 1280 px et 1440 px sans défilement horizontal nécessaire. Les contrôles de vue, filtres, lignes, menus et drawers SHALL être accessibles au clavier, avec un nom accessible et un état de focus visible.

#### Scenario: List view adapts on a narrow viewport

- **WHEN** l’utilisateur ouvre la vue Liste sur un écran de 390 px
- **THEN** les informations restent lisibles dans une présentation adaptée sans imposer une table plus large que la fenêtre
