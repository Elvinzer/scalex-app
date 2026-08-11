## MODIFIED Requirements

### Requirement: Activation readiness

Le système SHALL empêcher l'activation d'un événement qui ne possède pas au moins une plage valide, une durée valide, un closer éligible et une configuration Google complète pour chaque closer actif affecté. L'espace administrateur SHALL indiquer les prérequis manquants et fournir un accès direct à leur configuration. Les contrôles de connexion et de sélection des calendriers SHALL vivre dans les paramètres de la prise de rendez-vous, pas dans l'éditeur de l'événement.

#### Scenario: Incomplete event cannot be activated

- **WHEN** un utilisateur tente d'activer un événement sans disponibilité configurée
- **THEN** l'activation est refusée et le panneau affiche une erreur actionnable identifiant la disponibilité manquante

#### Scenario: Event with an unconfigured closer cannot be activated

- **WHEN** un utilisateur tente d'activer un événement dont un closer actif n'a pas de compte Google cible ou de calendrier de conflit configuré
- **THEN** l'activation est refusée et l'utilisateur peut ouvrir la page de paramètres des calendriers pour corriger la configuration

#### Scenario: Calendar settings are not edited on an event

- **WHEN** un utilisateur ouvre l'éditeur d'un événement
- **THEN** il peut consulter l'état de readiness et le lien vers les paramètres, mais les connexions Google et les sélections de calendriers ne sont pas modifiées depuis cet éditeur
