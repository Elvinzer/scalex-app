## Purpose

Cette capacité rend les actions commerciales prioritaires visibles dans le Dashboard de Scale X et permet à l’utilisateur d’ouvrir rapidement le contexte source approprié, avec une expérience accessible, dense et cohérente avec la DA existante.

## ADDED Requirements

### Requirement: Dashboard exposes an actionable revenue section

Le Dashboard SHALL afficher un bloc nommé `À faire maintenant` lorsqu’au moins une action de revenu accessible existe. Le bloc SHALL mettre en avant une seule action principale, puis afficher les actions secondaires dans un ordre identique à celui de la projection.

#### Scenario: Dashboard shows the highest-priority action first

- **WHEN** plusieurs actions de revenu sont disponibles
- **THEN** le bloc `À faire maintenant` affiche l’action la plus prioritaire en premier avec un CTA clair vers son contexte source

#### Scenario: Dashboard omits an empty revenue section

- **WHEN** aucune action de revenu accessible n’existe
- **THEN** le Dashboard ne montre pas une carte vide ou alarmante dédiée aux actions commerciales

### Requirement: Each action explains why it needs attention

Chaque ligne affichée SHALL présenter le nom ou titre disponible, la raison de l’action, son urgence ou sa date, et la valeur potentielle lorsqu’elle est connue. La priorité SHALL rester compréhensible sans dépendre uniquement d’une couleur.

#### Scenario: Action displays an overdue reason

- **WHEN** une action possède une échéance dépassée
- **THEN** l’interface affiche un texte du type `En retard de X j` en plus de l’indicateur visuel d’état

### Requirement: Action opens its source context

Le CTA d’une action SHALL ouvrir la page propriétaire correspondante et SHALL conserver l’identifiant ciblé lorsqu’un deep link est disponible. La page source SHALL mettre en évidence ou ouvrir l’élément ciblé et SHALL offrir un retour compréhensible vers le Dashboard.

#### Scenario: Pipeline action opens the selected lead

- **WHEN** l’utilisateur ouvre une action de rappel ou de no-show
- **THEN** Scale X ouvre Pipeline avec le lead concerné identifié et sans demander à l’utilisateur de le retrouver manuellement dans toutes les colonnes

#### Scenario: Native lead action opens the relaunch context

- **WHEN** l’utilisateur ouvre une action issue d’une réservation native
- **THEN** Scale X ouvre Rendez-vous avec le prospect concerné visible ou mis en évidence dans la liste `À relancer`

### Requirement: Revenue and technical alerts are visually separated

Le Dashboard SHALL distinguer `À faire maintenant` des problèmes techniques tels qu’une clé invalide ou une synchronisation en échec. Un problème technique SHALL ne SHALL pas remplacer silencieusement une action commerciale prioritaire.

#### Scenario: Revenue action remains visible with a failed integration

- **WHEN** un compte possède à la fois une relance commerciale et une synchronisation en échec
- **THEN** la relance apparaît dans `À faire maintenant` et l’échec apparaît dans une surface opérationnelle distincte

### Requirement: Action center is keyboard and screen-reader accessible

Tous les éléments interactifs du bloc SHALL être accessibles au clavier dans un ordre logique, SHALL afficher un état focus visible et SHALL fournir un nom accessible. Les états d’erreur et de chargement SHALL être annoncés sans dépendre de la couleur.

#### Scenario: Keyboard user reaches the primary action

- **WHEN** un utilisateur navigue au clavier jusqu’au bloc `À faire maintenant`
- **THEN** il peut atteindre le CTA principal, comprendre son libellé et l’activer sans utiliser de drag, hover ou souris

### Requirement: Action center remains usable on small screens

Le bloc SHALL s’adapter aux écrans étroits sans imposer de scroll horizontal. Les actions SHALL rester lisibles et leurs zones interactives SHALL mesurer au moins 44 px sur le petit écran ciblé.

#### Scenario: Revenue action list fits a small viewport

- **WHEN** le Dashboard est consulté sur une largeur de 375 px
- **THEN** les actions sont empilées, le CTA reste accessible et aucun contenu essentiel ne sort horizontalement de la fenêtre

### Requirement: Navigation does not add a CRM destination

La fonctionnalité SHALL réutiliser Dashboard, Pipeline, Appels et Rendez-vous. Elle ne SHALL pas ajouter une entrée de sidebar ou un onglet de pilier nommé `CRM`, `Relances` ou équivalent pour cette tranche.

#### Scenario: Existing navigation remains unchanged

- **WHEN** la fonctionnalité est activée
- **THEN** l’utilisateur retrouve les mêmes destinations principales et accède aux actions depuis le Dashboard puis la surface source
