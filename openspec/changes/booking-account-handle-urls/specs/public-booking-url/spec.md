## Purpose

Définit le contrat d'URL publique des liens de réservation natifs, namespacés par le handle de compte, ainsi que la rétrocompatibilité des anciens liens non namespacés.

## ADDED Requirements

### Requirement: URL publique namespacée par handle

L'URL publique canonique d'un événement de réservation SHALL être de la forme `/book/{handle}/{slug}`. La résolution publique SHALL retrouver l'événement en joignant le handle du compte propriétaire ET le slug de l'événement, et ne SHALL servir que les événements dont le statut est `active`.

#### Scenario: Résolution réussie
- **WHEN** un visiteur ouvre `/book/cedric-coaching/demo-appel-strategique` et qu'un événement actif de slug `demo-appel-strategique` appartient au compte de handle `cedric-coaching`
- **THEN** le système sert la page de réservation de cet événement

#### Scenario: Handle inexistant
- **WHEN** aucun compte ne porte le handle demandé
- **THEN** le système répond par une page « introuvable » (404) sans divulguer d'autre compte

#### Scenario: Bon handle mais slug d'un autre compte
- **WHEN** le slug demandé existe pour un autre compte mais pas pour le compte du handle fourni
- **THEN** le système répond « introuvable » (404) et ne sert pas l'événement de l'autre compte

#### Scenario: Événement non actif
- **WHEN** le couple `(handle, slug)` correspond à un événement en statut `draft` ou archivé
- **THEN** le système répond « introuvable » (404)

### Requirement: Rétrocompatibilité des anciens liens

Le système SHALL continuer à répondre aux anciens liens `/book/{slug}` en les redirigeant de façon permanente (301) vers l'URL canonique `/book/{handle}/{slug}` du compte propriétaire de cet événement. Les paramètres de requête existants (gestion, annulation, UTM) SHALL être préservés lors de la redirection.

#### Scenario: Ancien lien redirigé
- **WHEN** un visiteur ouvre un ancien lien `/book/demo-appel-strategique?manage=xxx`
- **THEN** le système redirige en 301 vers `/book/{handle}/demo-appel-strategique?manage=xxx`

#### Scenario: Collision résiduelle sur ancien lien
- **WHEN** un ancien slug correspond à plusieurs comptes
- **THEN** le système loggue un avertissement et redirige vers le premier événement actif trouvé

### Requirement: Endpoints API et ICS namespacés

Les endpoints API publics de réservation et le flux ICS SHALL suivre le même namespacing `(handle, slug)` que la page publique. Les liens de calendrier (`.ics`) émis SHALL utiliser l'URL namespacée.

#### Scenario: Endpoint de réservation namespacé
- **WHEN** le front public soumet une réservation pour `(cedric-coaching, demo-appel-strategique)`
- **THEN** l'API résout l'événement via le couple `(handle, slug)` avant de traiter la demande

#### Scenario: Fichier ICS namespacé
- **WHEN** un fichier ICS est généré pour une réservation confirmée
- **THEN** l'URL de l'événement qu'il contient est de la forme `/book/{handle}/{slug}`

### Requirement: Pages de réservation non indexées

Les pages publiques de réservation (`/book/{handle}/{slug}` et l'ancienne `/book/{slug}`) SHALL être exclues de l'indexation des moteurs de recherche (`noindex, nofollow`). Ce sont des pages transactionnelles par-client, sans objectif SEO.

#### Scenario: En-tête robots sur la page namespacée
- **WHEN** un moteur explore `/book/cedric-coaching/demo-appel-strategique`
- **THEN** la page renvoie une directive `noindex, nofollow`

#### Scenario: Ancien lien redirigé non indexé
- **WHEN** un moteur explore l'ancien `/book/{slug}`
- **THEN** il est redirigé (301) et la cible renvoie `noindex, nofollow`

### Requirement: Liens internes émis

Tout lien de réservation émis par le produit (UI d'agenda, page de configuration d'un événement, bouton « copier le lien », e-mails de notification et de rappel) SHALL utiliser l'URL canonique namespacée `/book/{handle}/{slug}`.

#### Scenario: Bouton copier le lien
- **WHEN** le propriétaire copie le lien d'un événement depuis l'agenda
- **THEN** le lien copié est de la forme `/book/{handle}/{slug}`

#### Scenario: Rappel e-mail
- **WHEN** un e-mail de rappel est envoyé à un lead
- **THEN** le lien de gestion pointe vers l'URL namespacée du compte
