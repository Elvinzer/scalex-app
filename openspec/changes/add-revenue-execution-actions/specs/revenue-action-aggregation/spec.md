## Purpose

Cette capacité fournit une projection account-scoped et déterministe des actions commerciales urgentes issues des données de leads, d’appels et de Rendez-vous existantes, sans créer de modèle de contact ou d’action générique.

## ADDED Requirements

### Requirement: Revenue actions are projected from existing sources

Le système SHALL exposer les actions commerciales ouvertes provenant des rappels de leads arrivés à échéance, des appels en attente de décision, des no-shows ouverts et des prospects de réservation native non convertis.

#### Scenario: Overdue lead reminder becomes an action

- **WHEN** un lead possède un rappel actif dont la date est aujourd’hui ou antérieure et qui n’est pas marqué comme terminé
- **THEN** la projection retourne une action identifiée par ce lead avec la raison, la date du rappel, la valeur potentielle et la destination Pipeline

#### Scenario: Pending closing decision becomes an action

- **WHEN** un appel possède l’issue `awaiting_decision`
- **THEN** la projection retourne une action identifiée par cet appel avec la date de réponse attendue lorsqu’elle existe et la destination Suivi des appels

#### Scenario: Open native booking lead becomes an action

- **WHEN** une tentative `native_booking_leads` possède le statut `open` ou `contacted` et n’est pas convertie
- **THEN** la projection retourne une action indiquant la dernière étape du parcours et la destination Rendez-vous

#### Scenario: Open no-show becomes an action

- **WHEN** un lead reste à l’étape `rdv_fixe` avec `isNoShow` actif
- **THEN** la projection retourne une action indiquant qu’il doit être récupéré et la destination Pipeline

### Requirement: One source item produces at most one revenue action

La projection SHALL retourner au plus une action commerciale pour un lead manuel donné. Lorsqu’un no-show et un rappel actif concernent le même lead, la raison `lead_no_show` SHALL être prioritaire et l’action générique de rappel SHALL ne SHALL pas être dupliquée.

#### Scenario: No-show and reminder are deduplicated

- **WHEN** un lead no-show possède également un rappel non terminé
- **THEN** une seule action apparaît pour ce lead et elle affiche la raison no-show

### Requirement: Revenue actions have stable identity and source context

Chaque action SHALL avoir un identifiant stable construit à partir de sa source et de son identifiant métier, un type, un titre, une raison lisible, une urgence, une destination et une date de référence lorsqu’elle existe. Deux lectures identiques des mêmes données SHALL produire le même identifiant.

#### Scenario: Repeated reads do not duplicate an action

- **WHEN** le Dashboard est rendu deux fois sans changement dans les données sources
- **THEN** chaque action conserve le même identifiant et n’apparaît qu’une seule fois dans chaque rendu

### Requirement: Actions are ordered deterministically

La projection SHALL ordonner les actions avec les échéances dépassées en premier, puis les échéances du jour, puis les no-shows ouverts et enfin les prospects natifs non convertis. Chaque groupe SHALL utiliser sa date de référence et un identifiant stable comme départage.

#### Scenario: Overdue action precedes a new abandoned lead

- **WHEN** un appel est en retard et un prospect natif vient d’abandonner sa réservation
- **THEN** l’action de l’appel apparaît avant celle du prospect natif

### Requirement: Revenue actions exclude technical alerts

La projection de revenu SHALL exclure les erreurs de clé API, les échecs de synchronisation et les autres problèmes purement techniques. Ces problèmes peuvent être exposés par une surface opérationnelle distincte.

#### Scenario: API key error does not occupy revenue queue

- **WHEN** la clé API du compte est invalide mais qu’aucun lead, appel ou rendez-vous ne nécessite une action commerciale
- **THEN** la projection de revenu est vide

### Requirement: Actions respect account and permission boundaries

Le système SHALL filtrer les actions par `accountId` côté serveur et SHALL exclure toute action dont la destination requiert une permission que l’utilisateur courant ne possède pas.

#### Scenario: Team member cannot receive an inaccessible action

- **WHEN** un membre dispose de la permission Dashboard mais pas de `ventes:rdv`
- **THEN** les actions issues des prospects natifs ne sont pas renvoyées à ce membre et aucune destination interdite n’est exposée

### Requirement: Source status remains authoritative

La projection SHALL être en lecture seule vis-à-vis des sources. Elle ne SHALL pas marquer une action comme terminée, contactée, ignorée ou résolue ; ces changements SHALL continuer à passer par les écrans et actions propriétaires de chaque source.

#### Scenario: Contacting a native lead changes the next projection

- **WHEN** un utilisateur marque un prospect natif comme contacté depuis Rendez-vous
- **THEN** la prochaine projection reflète le statut source mis à jour sans créer un second état d’action global
