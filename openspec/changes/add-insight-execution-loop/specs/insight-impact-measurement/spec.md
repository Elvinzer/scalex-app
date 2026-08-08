## Purpose

Cette capacité permet de mesurer honnêtement ce qui a changé après une action, en conservant un baseline serveur et en comparant uniquement des métriques, périodes et formules compatibles.

## ADDED Requirements

### Requirement: Launch captures a server-calculated baseline

Au lancement d’une initiative, le système SHALL capturer côté serveur la métrique de référence, sa valeur, son unité, sa période, sa fraîcheur, son benchmark éventuel et l’impact projeté disponible. Le client ne SHALL pas pouvoir fournir ou remplacer le baseline utilisé pour le calcul.

#### Scenario: Rate insight stores its baseline

- **WHEN** un utilisateur lance un insight lié à un taux de funnel calculable
- **THEN** l’initiative conserve le taux et la période calculés depuis les données account-scoped au moment du lancement

#### Scenario: Missing data prevents a false baseline

- **WHEN** la métrique d’un insight n’est plus calculable au moment du lancement
- **THEN** Scale X refuse le lancement mesurable avec une explication actionnable ou crée une initiative explicitement non mesurable, sans enregistrer zéro à la place d’une donnée manquante

### Requirement: Comparable metrics are measured after the action

Le système SHALL pouvoir recalculer la même métrique sur une période comparable après l’action et SHALL conserver la valeur après, la période, la source et la date de calcul. La mesure SHALL utiliser les mêmes règles déterministes que le Diagnostic et ne SHALL pas déléguer les sommes ou taux à Falco.

#### Scenario: Before and after rates are compared

- **WHEN** une initiative de taux atteint sa date de revue et que la période post-action contient assez de données
- **THEN** l’interface affiche la valeur avant, la valeur après et le delta en points de pourcentage avec les deux périodes visibles

#### Scenario: Result cannot yet be measured

- **WHEN** la période post-action est vide, trop récente ou incompatible avec le baseline
- **THEN** l’initiative reste `terminée` ou `en attente de mesure`, affiche la raison et ne passe pas à `Résultat mesuré`

### Requirement: Cash impact is labeled according to its evidence

Le système SHALL calculer un impact cash uniquement lorsqu’une formule déterministe et une source fiable le permettent. Il SHALL distinguer visuellement et textuellement `impact observé`, `gain estimé post-action` et `non calculable`, sans présenter une corrélation comme une causalité prouvée.

#### Scenario: Deterministic cash impact is available

- **WHEN** une initiative possède une métrique de revenu et une formule de comparaison validée par le domaine
- **THEN** Scale X affiche le montant, la période, la source et le libellé de preuve correspondant

#### Scenario: Cash attribution is not deterministic

- **WHEN** plusieurs changements ou une donnée partielle empêchent d’attribuer un montant à l’initiative
- **THEN** l’interface affiche l’évolution mesurée ou `non calculable` et ne fabrique pas un montant de cash récupéré

### Requirement: An initiative can reach the measured-result status

Une initiative SHALL pouvoir passer de `terminée` à `résultat mesuré` uniquement lorsqu’un snapshot de résultat valide existe. Le résultat SHALL rester consultable même si les données sources évoluent ensuite.

#### Scenario: Valid measurement closes the loop

- **WHEN** une mesure comparable est enregistrée avec sa période et sa provenance
- **THEN** l’initiative passe à `résultat mesuré`, le Journal reçoit un événement et l’historique affiche le baseline et le résultat

#### Scenario: Historical result remains stable

- **WHEN** les métriques courantes sont resynchronisées après une mesure
- **THEN** le snapshot historique du résultat ne change pas silencieusement ; une nouvelle mesure crée une nouvelle version explicitement datée

### Requirement: Unsupported insights remain honest

Les insights sans métrique canonique comparable SHALL pouvoir être suivis et terminés, mais l’interface SHALL indiquer qu’aucune comparaison automatique n’est disponible. Une note qualitative utilisateur SHALL être distinguée d’un résultat calculé.

#### Scenario: Qualitative result is recorded

- **WHEN** l’utilisateur termine une initiative non mesurable et ajoute une observation textuelle
- **THEN** l’initiative affiche `terminée — observation utilisateur` et ne la présente pas comme une amélioration calculée
