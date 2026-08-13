## Purpose

Cette capacité transforme la lecture des performances en recommandations orientées décision, déclenchées par des règles nommées et chiffrées, traçables jusqu'à leurs sources, et matérialisées dans l'historique d'insights existant.

## ADDED Requirements

### Requirement: An insight is decision-oriented and complete

Chaque insight SHALL contenir un titre clair, un niveau de priorité, une preuve chiffrée, une période, un diagnostic probable, une action recommandée, un impact attendu, un niveau de confiance, ses sources de données et son statut de couverture.

#### Scenario: An insight is displayed

- **WHEN** Minaly propose une recommandation sur une campagne
- **THEN** les dix éléments sont présents et la preuve chiffrée précède le diagnostic

#### Scenario: An insight cannot state its sources

- **WHEN** la provenance d'une donnée ne peut être qualifiée
- **THEN** l'insight n'est pas affiché

### Requirement: Insights are produced by named, quantified rules per campaign type

Le système SHALL déclencher les insights à partir d'un catalogue de règles nommées, propres au type de campagne, dont les conditions sont chiffrées et les seuils configurables. Le système SHALL NOT produire de recommandation hors de ce catalogue.

Règles minimales attendues :

```text
VSL         vsl_hook_ok_retention_faible   hook rate ≥ référence ET rétention 15 s < seuil
VSL         vsl_ctr_ok_landing_faible      CTR sortant ≥ référence ET taux LP → opt-in < seuil
VSL         vsl_leads_ok_cash_baisse       CPL stable ET cash par lead en baisse sur la période
Webinar     web_inscription_ok_showup_bas  coût par inscription stable ET show-up rate en baisse
Webinar     web_trafic_qualifie            coût par participant en hausse ET qualité post-webinar stable
Instagram   ig_visites_ok_follow_bas       coût par visite en baisse ET taux visite → follow < seuil
Instagram   ig_follows_moins_engages       follows en hausse ET engagement par follower en baisse
Retargeting rt_saturation                  fréquence en hausse ET CTR en baisse ET CPA en hausse
Retargeting rt_exclusion_manquante         acheteurs détectés dans une audience active
Retargeting rt_fenetre_inefficace          CPA d'une fenêtre > seuil × CPA de la meilleure fenêtre
```

#### Scenario: A rule fires with its evidence

- **WHEN** les conditions chiffrées de `rt_saturation` sont réunies sur la période
- **THEN** l'insight cite les valeurs mesurées, les seuils utilisés et l'évolution des trois métriques concernées

#### Scenario: A rule cannot evaluate its inputs

- **WHEN** une métrique nécessaire à une règle est indisponible ou sous le seuil de couverture
- **THEN** la règle ne se déclenche pas et aucune version dégradée de l'insight n'est produite

#### Scenario: A campaign is not configured

- **WHEN** aucun type manuel n'est enregistré, ou qu'une VSL/Webinaire n'a pas d'objectif Appel/Vente
- **THEN** aucune règle spécialisée ne se déclenche et Minaly invite l'utilisateur à configurer la campagne

### Requirement: Insights are idempotent across synchronisations

Le système SHALL identifier chaque insight par une empreinte `hash(accountId, campaignId, campaignType, conversionGoal, ruleKey, metric, period)`. Une nouvelle synchronisation SHALL mettre à jour l'insight portant la même empreinte plutôt que d'en créer un nouveau, et SHALL NOT réinitialiser la décision utilisateur. Un changement Appel/Vente SHALL produire une nouvelle identité d'insight afin de ne pas mélanger deux lectures business.

#### Scenario: The 6-hour sync re-evaluates the same rule

- **WHEN** la même règle se redéclenche sur la même campagne et la même période
- **THEN** l'insight existant est mis à jour avec la preuve chiffrée la plus récente, sans doublon dans l'historique

#### Scenario: A user has already dismissed the insight

- **WHEN** l'insight avait été écarté et que la règle se redéclenche à l'identique
- **THEN** son statut d'écarté est conservé et il n'est pas remonté en priorité sans réactivation manuelle

### Requirement: Meta insights reuse the existing insight history

Le système SHALL matérialiser les insights Meta dans les `insightRecords` existants et SHALL utiliser `launchInsight` pour l'adoption. Le système SHALL NOT créer une seconde source de vérité pour les insights ou pour le Journal.

#### Scenario: A Meta insight is adopted

- **WHEN** l'utilisateur adopte un insight Meta
- **THEN** une initiative est créée par le même chemin que les insights Diagnostic et Funnel, et apparaît dans les mêmes surfaces

### Requirement: Sources are always named

Le système SHALL indiquer si une recommandation repose sur une donnée Meta, Stripe, Calendly, iClosed, Instagram, ou sur une estimation Minaly, et SHALL afficher la couverture de chaque source sur la période.

#### Scenario: Mixed-source insight

- **WHEN** un insight combine dépenses Meta et présence Calendly
- **THEN** les deux sources sont nommées avec leur taux de couverture respectif sur la période analysée

### Requirement: Without business targets, no absolute judgement

En l'absence de cible business configurée, le système SHALL comparer uniquement à l'historique du compte et SHALL ne produire aucun jugement absolu de type `bon` ou `mauvais`.

#### Scenario: No target configured

- **WHEN** aucune cible CPL/CPA ni break-even n'est renseignée
- **THEN** l'insight formule une évolution relative à l'historique et n'affirme pas qu'une valeur est bonne ou mauvaise

#### Scenario: Target configured

- **WHEN** une cible CPL est renseignée
- **THEN** l'écart à la cible est affiché explicitement avec la valeur de la cible

### Requirement: Adopting an insight never writes to Meta

Le système SHALL proposer `Adopter dans le Journal` avec titre, action exacte, critère de réussite, métrique de départ, date cible, responsable, lien vers la campagne et la source `Meta Ads · nom de campagne`. Cette adoption SHALL ne produire aucune écriture dans Meta.

#### Scenario: User adopts an insight

- **WHEN** l'utilisateur confirme l'adoption
- **THEN** une initiative est créée avec sa métrique de départ figée, et aucune requête d'écriture n'est envoyée à Meta

#### Scenario: Starting metric is immutable

- **WHEN** l'utilisateur modifie les champs du dialogue d'adoption
- **THEN** la métrique de départ reste non modifiable car elle sert de référence de mesure
