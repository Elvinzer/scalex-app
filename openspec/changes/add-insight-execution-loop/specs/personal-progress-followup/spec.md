## Purpose

Cette capacité rend l’amélioration visible et motivante à l’échelle d’un utilisateur, puis permet à Falco de relancer une priorité réelle sans transformer Minaly en jeu vidéo ou en système de notifications intrusif.

## ADDED Requirements

### Requirement: Personal progress is based on meaningful transitions

Le système SHALL afficher une progression personnelle fondée sur les transitions d’initiatives et de résultats : priorité choisie, action lancée, action terminée et résultat mesuré. Les vues, clics, conversations ou tâches personnelles ne SHALL pas augmenter la progression business.

#### Scenario: Weekly momentum reflects a completed priority

- **WHEN** la priorité hebdomadaire passe à `terminée`
- **THEN** le bloc `Élan de la semaine` affiche une progression positive et relie celle-ci à l’initiative concernée

#### Scenario: Personal comparison is available

- **WHEN** l’utilisateur ouvre son historique de progression
- **THEN** Minaly compare sa semaine courante à ses semaines précédentes avec des volumes d’actions et de résultats, sans comparer publiquement son compte à un autre compte

### Requirement: The product celebrates milestones without artificial scoring

Minaly SHALL pouvoir célébrer de manière discrète les premiers jalons significatifs, notamment le premier insight lancé, la première action terminée et le premier résultat mesuré. Cette tranche SHALL ne SHALL pas introduire de points, de monnaie virtuelle, de niveau obligatoire ou de leaderboard inter-comptes.

#### Scenario: First measured result gets a celebration

- **WHEN** l’utilisateur obtient son premier résultat mesuré
- **THEN** Falco ou l’interface affiche une confirmation courte et contextualisée, respectant la préférence de réduction des animations

#### Scenario: No reward for empty activity

- **WHEN** l’utilisateur ouvre plusieurs fois le Dashboard sans lancer ou terminer une initiative
- **THEN** sa progression business ne change pas et Minaly ne déclenche pas de récompense artificielle

### Requirement: Falco follows up on unfinished initiatives contextually

Falco SHALL pouvoir rappeler une initiative `planifiée`, `en cours` ou `en attente de mesure` lorsque son échéance approche, est dépassée ou qu’aucune activité n’a été enregistrée depuis la dernière relance. Le rappel SHALL inclure le titre, la raison, l’échéance et le lien vers l’initiative.

#### Scenario: Upcoming priority receives a contextual nudge

- **WHEN** une initiative assignée arrive dans sa fenêtre de rappel et n’est ni terminée ni en pause
- **THEN** le Dashboard ou le briefing hebdomadaire affiche un rappel contextualisé qui permet de reprendre, reporter ou mettre en pause

#### Scenario: Paused initiative is not nagged

- **WHEN** l’utilisateur met une initiative en pause ou l’écarte
- **THEN** Falco cesse les rappels jusqu’à une reprise explicite et conserve la décision dans l’historique

### Requirement: Follow-ups are bounded and idempotent

Le système SHALL limiter les relances à une par initiative et par fenêtre hebdomadaire, SHALL respecter les préférences de briefing et SHALL être idempotent lors d’un rerun de job. Une relance déjà créée ne SHALL pas être dupliquée.

#### Scenario: Weekly job reruns safely

- **WHEN** le job de briefing est rejoué pour la même semaine
- **THEN** Minaly conserve un seul rappel par initiative et ne génère pas de doublon d’événement ou d’email

#### Scenario: Measured result suppresses future follow-up

- **WHEN** une initiative passe à `résultat mesuré`
- **THEN** elle disparaît des relances actives et reste visible dans la progression historique

### Requirement: Progress is visible from existing product surfaces

La progression SHALL être visible dans le Dashboard, le Journal ou le Diagnostic existants. Le système ne SHALL pas ajouter une entrée de navigation dédiée `Gamification`, `Classement` ou `Points`.

#### Scenario: User can resume from the Dashboard

- **WHEN** une priorité hebdomadaire est active
- **THEN** le Dashboard affiche son état, son responsable, sa prochaine étape et un lien vers sa cible Journal ou sa source métier
