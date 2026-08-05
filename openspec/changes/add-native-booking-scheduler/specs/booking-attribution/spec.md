## Purpose

Cette capacité permet de relier chaque réservation native à son lien marketing, sa plateforme et sa campagne afin de mesurer quelle vidéo ou application génère les appels de vente.

## ADDED Requirements

### Requirement: UTM parameters are captured at entry

La page publique SHALL capturer les paramètres `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` et `utm_term` présents à l’arrivée, ainsi que les paramètres UTM additionnels non vides. Ces valeurs SHALL rester disponibles après la saisie du formulaire et les changements de fuseau ou de date.

#### Scenario: YouTube link keeps its attribution through opt-in

- **WHEN** un prospect arrive avec `utm_source=youtube` et `utm_content=video-123`, puis remplit le formulaire
- **THEN** les deux valeurs sont conservées jusqu’à la confirmation ou l’abandon de la réservation

### Requirement: Named tracking links

L’espace administrateur SHALL permettre de créer un lien nommé pour un événement avec une plateforme, une campagne, un contenu facultatif et des paramètres UTM prédéfinis. Le lien SHALL pouvoir être copié et désactivé sans supprimer les données historiques.

#### Scenario: Instagram link is generated for an event

- **WHEN** un utilisateur crée un lien « Instagram bio » avec ses paramètres UTM
- **THEN** Scale X génère une URL partageable qui préremplit ces paramètres lors de son ouverture

### Requirement: Attribution is immutable on the booking snapshot

Lors de la confirmation, le système SHALL enregistrer une copie des valeurs UTM, du lien utilisé et de la page d’entrée sur la réservation et l’appel de vente. Une modification ultérieure d’un lien SHALL ne SHALL pas réécrire l’historique des réservations déjà confirmées.

#### Scenario: Link edit does not rewrite historical attribution

- **WHEN** un administrateur renomme ou modifie un lien après une réservation
- **THEN** la réservation conserve le nom et les paramètres enregistrés au moment de sa confirmation

### Requirement: Attribution is visible in sales tracking

Le suivi des appels SHALL afficher la source marketing disponible pour un appel natif et permettre de distinguer au minimum la plateforme, la campagne et le contenu lorsque ces valeurs existent.

#### Scenario: Sales call identifies the originating video

- **WHEN** un appel natif provient d’un lien YouTube associé à une vidéo
- **THEN** le détail de l’appel affiche YouTube, la campagne et l’identifiant ou le libellé de la vidéo
