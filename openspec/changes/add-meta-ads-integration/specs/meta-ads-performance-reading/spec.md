## Purpose

Cette capacité expose les performances Meta lues et dérivées, en qualifiant l'origine, le mode de calcul et le rattachement de chaque chiffre, et adapte la lecture au type de campagne.

## ADDED Requirements

### Requirement: Meta Ads is the only campaign source in the Ads module

Le système SHALL afficher dans le module Ads uniquement les campagnes synchronisées depuis Meta Ads. Il SHALL ne plus proposer de création, édition, suppression ou import manuel de campagnes publicitaires ; une configuration manuelle du type de campagne reste autorisée car elle ne crée ni ne modifie une campagne Meta.

#### Scenario: User opens the Ads module

- **WHEN** l'utilisateur consulte `/acquisition/ads`
- **THEN** Minaly affiche les campagnes Meta synchronisées et ne rend visible aucun formulaire ou tableau de suivi manuel complémentaire

#### Scenario: User imports a file containing ad campaigns

- **WHEN** une feuille ressemble à un export de campagnes publicitaires
- **THEN** le flux d'import ne propose pas la destination Ads et n'écrit aucune ligne dans le stockage legacy `ad_campaigns`

### Requirement: Every metric carries a three-axis provenance

Le système SHALL qualifier chaque métrique exposée sur trois axes indépendants : `source` (`meta`, `stripe`, `calendly`, `iclosed`, `instagram`, `minaly`), `calculation` (`brute`, `derivee`) et `attribution` (`directe`, `jointe`, `estimee`, `non_rattachee`, `indisponible`). Le libellé affiché SHALL être dérivé de ce triplet et SHALL ne jamais être transmis par la couleur seule.

#### Scenario: A Meta-provided metric is displayed

- **WHEN** le CPM d'une campagne est affiché
- **THEN** il porte `source: meta`, `calculation: brute`, `attribution: directe` et la période sur laquelle il est calculé

#### Scenario: A deterministic joined metric is not labelled as estimated

- **WHEN** le CAC cash est calculé depuis des dépenses Meta et du cash Stripe rattaché par identifiant de campagne
- **THEN** il porte `calculation: derivee` et `attribution: jointe`, et n'est pas présenté comme une estimation

#### Scenario: A genuinely estimated metric is labelled as such

- **WHEN** le coût par follower Instagram est calculé sur une fenêtre d'observation sans attribution directe
- **THEN** il porte `attribution: estimee` et sa méthode de calcul est consultable

### Requirement: Non-computable values are never rendered as zero

Le système SHALL afficher `—` accompagné du motif lorsqu'une métrique n'est pas calculable pour la période, le type de campagne ou faute de source connectée.

#### Scenario: Not enough data for a reliable reading

- **WHEN** la période analysée ne contient pas assez de volume
- **THEN** Minaly affiche le compte connecté, la période, l'absence de données exploitables et n'affiche aucun KPI à zéro

#### Scenario: A metric does not exist for this campaign type

- **WHEN** un coût par lead est demandé sur une campagne de croissance Instagram
- **THEN** Minaly affiche `—` avec le motif, et non une valeur nulle

### Requirement: Funnel steps without a connected source are unavailable, not estimated

Le système SHALL afficher une étape de funnel dont la source n'est pas connectée avec `attribution: indisponible`, en nommant la source manquante et l'action pour la brancher. Le système SHALL NOT estimer, interpoler ni masquer cette étape.

#### Scenario: VSL watch depth has no event source

- **WHEN** aucune source d'événements de lecture VSL n'est branchée
- **THEN** les étapes `Lecture VSL` et `Watch depth` restent visibles dans le funnel, marquées indisponibles, avec l'indication de ce qu'il faut connecter

#### Scenario: Webinar attendance has no source

- **WHEN** ni Calendly, ni iClosed, ni une source d'événements webinar ne fournit la présence live
- **THEN** `Présence live` et `Présence jusqu'au pitch` sont indisponibles, et aucun coût par participant n'est calculé

### Requirement: The consolidation window is computed, not fixed

Le système SHALL calculer la fenêtre de consolidation de chaque série à partir de la fenêtre d'attribution configurée sur le compte et du délai de traitement connu de l'API, SHALL la persister avec la série et SHALL l'afficher dans l'interface.

#### Scenario: User reads a period overlapping the window

- **WHEN** la période sélectionnée inclut des jours non consolidés
- **THEN** Minaly indique jusqu'à quelle date les chiffres sont définitifs et signale que les jours suivants peuvent évoluer

#### Scenario: A consolidated day changes retroactively

- **WHEN** une resynchronisation modifie une valeur d'un jour déjà consolidé
- **THEN** la correction est journalisée et visible, et n'écrase pas silencieusement la valeur précédente

### Requirement: Campaign type is explicitly configured by the user

Le système SHALL demander à l'utilisateur de choisir explicitement un seul type parmi VSL, Webinaire, Trafic Instagram et Retargeting. Le système SHALL NOT déduire ni préremplir ce type depuis le nom de campagne, l'objectif Meta, le performance goal, la landing page ou tout autre signal technique. Tant que le choix n'est pas enregistré, le funnel spécialisé et les insights propres au type SHALL rester en attente. Le choix SHALL déterminer le funnel, les KPI prioritaires et les règles de diagnostic, et SHALL ne produire aucune écriture dans Meta.

#### Scenario: Campaign has not been configured

- **WHEN** une campagne vient d'être synchronisée sans configuration utilisateur
- **THEN** Minaly affiche `Type à définir`, propose les quatre choix explicites et n'affiche aucun funnel ou insight spécialisé

#### Scenario: User configures the campaign type

- **WHEN** l'utilisateur enregistre VSL, Webinaire, Trafic Instagram ou Retargeting
- **THEN** le funnel, les KPI et les règles d'insight correspondants deviennent disponibles, et aucune requête d'écriture n'est envoyée à Meta

### Requirement: VSL and webinar conversion goals are explicit

Le système SHALL demander, pour une campagne VSL ou Webinaire, un objectif de conversion parmi Appel et Vente. Il SHALL refuser une configuration incomplète ou un objectif de conversion associé à Trafic Instagram ou Retargeting. Cet objectif SHALL piloter le libellé et la dernière étape du funnel ; la valeur SHALL provenir de l'attribution Minaly et rester indisponible si cette source n'est pas couverte.

#### Scenario: A VSL tracks booked calls

- **WHEN** l'utilisateur configure une VSL avec l'objectif Appel
- **THEN** le funnel affiche les appels réservés comme conversion business, avec la provenance Minaly et `—` si l'attribution est indisponible

#### Scenario: A webinar tracks sales

- **WHEN** l'utilisateur configure un Webinaire avec l'objectif Vente
- **THEN** le funnel affiche les ventes reliées comme conversion business, sans transformer l'objectif technique Meta en preuve de vente

### Requirement: Instagram growth distinguishes attributed from observed

Le système SHALL distinguer les visites de profil attribuées par Meta des follows observés dans Instagram, et SHALL présenter le coût par follower comme `estimee` lorsqu'il n'est pas directement attribué.

#### Scenario: Cost per follower is displayed

- **WHEN** une campagne de croissance Instagram est consultée
- **THEN** le coût par follower est marqué `estimee`, avec sa fenêtre de calcul et la mention que les follows sont observés, pas attribués

### Requirement: Meta ROAS and observed cash are never merged

Le système SHALL afficher le ROAS Meta et le cash observé comme deux lectures distinctes et SHALL ne pas produire une valeur unique fusionnée.

#### Scenario: Both readings diverge

- **WHEN** le ROAS Meta et le cash Stripe rattaché racontent deux histoires différentes
- **THEN** les deux sont affichés côte à côte avec leur provenance, sans arbitrage automatique

### Requirement: Every figure has a tabular alternative

Le système SHALL exposer, pour chaque représentation graphique (funnel, matrice créative, séries temporelles), une lecture tabulaire équivalente visible sans survol.

#### Scenario: Creative matrix on a small screen

- **WHEN** l'analyse créative est consultée sur mobile
- **THEN** le classement tabulaire est affiché par défaut et la matrice reste accessible à la demande

### Requirement: Audience and placement warnings state their threshold

Le système SHALL avertir lorsqu'une audience est trop petite pour conclure, saturée en fréquence, ou probablement en chevauchement, et SHALL afficher le seuil déclencheur de l'avertissement.

#### Scenario: Frequency crosses the saturation threshold

- **WHEN** la fréquence d'une audience dépasse le seuil configuré sur la période
- **THEN** Minaly affiche l'avertissement, la valeur mesurée et le seuil utilisé
