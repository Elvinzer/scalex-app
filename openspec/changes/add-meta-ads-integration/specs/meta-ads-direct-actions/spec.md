## Purpose

Cette capacité autorise un nombre volontairement réduit d'écritures dans Meta Ads depuis Minaly, toujours derrière une permission obtenue au moment utile et une confirmation explicite, avec un résultat vérifié et un audit complet.

## ADDED Requirements

### Requirement: Only three actions are writable

Le système SHALL permettre uniquement de mettre en pause une campagne, un ensemble ou une publicité, de la réactiver, et de modifier un budget quotidien. Toute autre modification SHALL renvoyer vers Meta Ads.

#### Scenario: An unsupported change is needed

- **WHEN** une recommandation implique un changement de ciblage ou de créatif
- **THEN** Minaly propose `Ouvrir dans Meta Ads` et ne propose aucune écriture

### Requirement: Write permission is requested at the moment of use

Le système SHALL vérifier la présence du scope `ads_management` avant l'étape de confirmation et SHALL déclencher un step-up OAuth si le scope est absent.

#### Scenario: First write of the account

- **WHEN** l'utilisateur veut appliquer une action et que seul `ads_read` a été accordé
- **THEN** Minaly demande la permission d'écriture avant toute confirmation, puis reprend l'action au même point

#### Scenario: Step-up is declined

- **WHEN** l'utilisateur refuse la permission d'écriture
- **THEN** aucune écriture n'est tentée, l'action bascule sur le deep-link Meta et la lecture reste fonctionnelle

### Requirement: Every write goes through proposal, confirmation and result

Le système SHALL présenter une étape de proposition (action, campagne concernée, valeur actuelle, nouvelle valeur, justification, impact potentiel, risque, lien Meta Ads), puis une étape de confirmation distincte, puis une étape de résultat. Le passage de la proposition à la confirmation SHALL toujours résulter d'une action utilisateur explicite.

#### Scenario: Budget change is confirmed

- **WHEN** l'utilisateur confirme un passage de 100 $/jour à 120 $/jour
- **THEN** l'écran de confirmation affiche la valeur actuelle, la nouvelle valeur et la variation en pourcentage avant exécution

#### Scenario: Pausing requires an additional confirmation

- **WHEN** l'action proposée est une mise en pause
- **THEN** Minaly indique explicitement que la diffusion sera interrompue et demande une confirmation supplémentaire

#### Scenario: No automatic execution

- **WHEN** un insight recommande une action
- **THEN** aucune écriture n'est exécutée sans passage par la confirmation, quelle que soit la confiance de la recommandation

### Requirement: Budget changes are bounded by a safety limit

Le système SHALL appliquer une limite de sécurité à toute modification de budget quotidien. Au-delà de la limite, l'action SHALL être refusée et remplacée par un renvoi vers Meta Ads.

#### Scenario: Change exceeds the safety limit

- **WHEN** la variation demandée dépasse la limite configurée
- **THEN** Minaly refuse l'exécution, explique la limite et propose `Ouvrir dans Meta Ads`

### Requirement: Result states are exhaustive and honest

Le système SHALL exposer les états action en cours, action réussie, action échouée, permission insuffisante, campagne modifiée entre-temps, et état inconnu nécessitant une nouvelle synchronisation.

#### Scenario: Campaign changed between proposal and confirmation

- **WHEN** la valeur relue dans Meta diffère de la valeur affichée dans la proposition
- **THEN** Minaly interrompt l'exécution, affiche la valeur courante et demande une nouvelle décision

#### Scenario: Success is verified, not assumed

- **WHEN** l'écriture est acceptée par l'API Meta
- **THEN** Minaly relit la valeur depuis Meta avant d'annoncer le succès, et bascule sur `état inconnu` si la relecture échoue

### Requirement: Meta deep-links are built server-side and validated

Le système SHALL construire les liens `Ouvrir dans Meta Ads` côté serveur, au niveau d'objet le plus précis disponible (publicité, puis ensemble, puis campagne, puis compte). Les identifiants SHALL être validés comme appartenant au compte connecté, et le lien SHALL s'ouvrir en nouvel onglet avec `rel="noopener noreferrer"`.

#### Scenario: Deep-link for an ad

- **WHEN** l'utilisateur ouvre une publicité dans Meta
- **THEN** le lien pointe directement sur cette publicité dans le bon compte publicitaire

#### Scenario: Object no longer exists

- **WHEN** l'objet ciblé n'existe plus ou n'appartient pas au compte connecté
- **THEN** le lien retombe sur le niveau supérieur disponible et Minaly l'indique, sans construire d'URL à partir d'un identifiant non validé

### Requirement: Every attempt is audited

Le système SHALL écrire une ligne d'audit dans la campagne et dans le Journal pour chaque tentative, y compris les échecs, avec l'action, les valeurs avant/après, l'auteur, la date et le résultat.

#### Scenario: A failed action is recorded

- **WHEN** une mise en pause échoue pour permission insuffisante
- **THEN** l'historique de la campagne indique la tentative, son motif d'échec et le fait qu'aucune modification n'a été effectuée
