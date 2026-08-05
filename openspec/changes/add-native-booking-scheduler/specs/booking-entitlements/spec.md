## Purpose

Cette capacité permet à l’administration de définir les droits de réservation par abonnement et garantit que les limites commerciales sont appliquées de manière cohérente à la création et à l’activation des événements.

## ADDED Requirements

### Requirement: Booking entitlements are configurable by plan

Le panneau d’administration des abonnements SHALL permettre de configurer au minimum l’accès à la réservation native et un nombre maximal d’événements. Une valeur illimitée SHALL être représentable explicitement. Les droits SHALL être validés avant d’être enregistrés.

#### Scenario: Admin configures the entry plan

- **WHEN** un administrateur active la réservation native et définit une limite d’un événement sur le plan d’entrée
- **THEN** le plan sauvegarde ces droits et les comptes actifs utilisant ce plan les reçoivent

### Requirement: Entry plan limits event creation

Un compte dont l’abonnement actif autorise au maximum un événement SHALL pouvoir créer ou conserver un seul événement non archivé. Une tentative de créer ou d’activer un événement supplémentaire SHALL être refusée avec une indication claire du plan requis.

#### Scenario: Second event is blocked on the cheapest plan

- **WHEN** un compte possède déjà un événement non archivé et tente d’en créer un deuxième avec le plan d’entrée
- **THEN** la création est refusée et l’interface propose de passer au niveau d’abonnement supérieur

### Requirement: Higher plan allows unlimited events

Un compte dont l’abonnement actif possède une limite illimitée SHALL pouvoir créer et activer autant d’événements non archivés que nécessaire, sous réserve des autres validations de configuration.

#### Scenario: Higher subscription removes the event limit

- **WHEN** un compte passe à un abonnement dont la limite d’événements est illimitée
- **THEN** il peut créer un nouvel événement sans que le nombre de ses événements existants bloque la création

### Requirement: Entitlement changes do not destroy existing data

Lorsqu’un compte rétrograde vers un plan plus limité, le système SHALL conserver les événements et rendez-vous existants. Il SHALL empêcher uniquement les nouvelles créations ou activations qui dépassent la limite, et SHALL expliquer la situation dans l’administration.

#### Scenario: Downgrade with multiple existing events

- **WHEN** un compte possédant plusieurs événements passe à un plan limité à un événement
- **THEN** les données et rendez-vous existants restent accessibles, mais la création ou l’activation d’événements supplémentaires est bloquée jusqu’à régularisation

### Requirement: Runtime checks cannot be bypassed by public requests

Les contrôles d’abonnement SHALL être appliqués côté serveur pour les opérations de création et d’activation. Une requête publique ou une modification directe du navigateur ne SHALL pas permettre de contourner une limite.

#### Scenario: Client-side bypass attempt fails

- **WHEN** un utilisateur modifie la requête de création pour demander un deuxième événement malgré une limite d’un
- **THEN** le serveur refuse l’opération et aucune donnée d’événement n’est créée
