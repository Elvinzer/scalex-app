## Purpose

Cette capacité permet à chaque événement de définir des questions de qualification persistées, de les rendre dynamiquement sur la page publique et de conserver les réponses dans le contexte du prospect et du rendez-vous.

## ADDED Requirements

### Requirement: Event questions support the five configured types

Un utilisateur autorisé SHALL pouvoir créer et modifier des questions d’événement de type `radio`, `checkbox`, `text`, `textarea` ou `select`. Une question SHALL posséder un libellé, un ordre, un indicateur obligatoire et, pour les types à choix, une liste d’options. Aucune question de démonstration SHALL être injectée automatiquement.

#### Scenario: New event starts without qualification questions

- **WHEN** un utilisateur crée un événement sans ajouter de question
- **THEN** la page publique ne rend aucune question et aucune réponse fictive n’est enregistrée

#### Scenario: Choice question requires options

- **WHEN** l’utilisateur tente d’enregistrer une question `radio`, `checkbox` ou `select` sans option valide
- **THEN** l’enregistrement est refusé avec une erreur attachée à la question

### Requirement: Questions can be managed in event configuration

L’interface de configuration SHALL permettre d’ajouter, modifier, supprimer et réordonner les questions. Le réordonnancement SHALL être possible au clavier en complément du glisser-déposer. Les modifications non enregistrées SHALL être signalées avant une sortie qui les ferait perdre.

#### Scenario: User reorders questions

- **WHEN** l’utilisateur déplace une question puis enregistre l’événement
- **THEN** l’ordre de rendu public et l’ordre d’affichage des réponses suivent le nouvel ordre

### Requirement: Public questions render from event configuration

La page publique SHALL rendre les questions configurées dans leur ordre, avec le contrôle correspondant à leur type, un vrai libellé, l’aide facultative et la mention optionnelle lorsqu’une question n’est pas obligatoire. Les questions SHALL apparaître au palier de qualification prévu, jamais avant que l’identité du prospect soit validée.

#### Scenario: Configured question is visible at the qualification stage

- **WHEN** un événement possède une question textarea obligatoire et que le prospect atteint le palier email/questions
- **THEN** la textarea apparaît avec son libellé et bloque la progression tant qu’elle est vide

### Requirement: Required answers gate slot access

Les questions obligatoires SHALL être validées avant la révélation des créneaux. Les questions facultatives SHALL pouvoir rester vides. Une erreur SHALL expliquer la correction attendue près de la question et être annoncée aux technologies d’assistance.

#### Scenario: Missing required answer prevents calendar reveal

- **WHEN** le prospect tente de continuer avec une question obligatoire non renseignée
- **THEN** les créneaux restent verrouillés, la question reçoit le focus ou est ciblée par l’erreur et le prospect peut la corriger

### Requirement: Answers are retained with lead and booking

Les réponses valides SHALL être associées au lead de réservation et copiées dans le contexte du rendez-vous confirmé. Une modification ultérieure de la configuration d’une question SHALL conserver l’interprétation historique de la réponse enregistrée.

#### Scenario: Booking detail shows qualification answers

- **WHEN** un closer ouvre la fiche d’un rendez-vous dont le prospect a répondu aux questions
- **THEN** la fiche affiche chaque libellé, sa réponse et les valeurs multiples dans l’ordre du rendez-vous

### Requirement: Question controls meet accessibility requirements

Les options radio et checkbox SHALL être sélectionnables via leur libellé complet, les groupes SHALL posséder un nom accessible et les contrôles SHALL être utilisables au clavier et sur mobile avec une cible d’au moins 44 px. La couleur SHALL être complétée par un état textuel ou sémantique.

#### Scenario: Keyboard user completes a choice question

- **WHEN** un prospect navigue au clavier dans une question radio ou checkbox
- **THEN** chaque option est atteignable, son état sélectionné est annoncé et le focus reste visible
