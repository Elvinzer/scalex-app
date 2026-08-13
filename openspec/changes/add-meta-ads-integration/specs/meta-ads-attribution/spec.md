## Purpose

Cette capacité relie une dépense Meta au cash encaissé en propageant des identifiants explicites de la publicité jusqu'à Stripe. Elle ne devine jamais un rattachement et ne construit aucun modèle multi-touch pondéré.

## ADDED Requirements

### Requirement: Attribution relies on propagated identifiers, never on inference

Le système SHALL rattacher un lead, un rendez-vous ou une vente à une entité Meta uniquement à partir d'identifiants propagés (`campaign_id`, `adset_id`, `ad_id`) ou, à défaut, de paramètres `utm_*`. Le système SHALL NOT attribuer par proximité temporelle, par part de dépense ni par répartition au prorata.

#### Scenario: No identifier is available

- **WHEN** une vente Stripe ne porte aucun identifiant ni paramètre UTM exploitable
- **THEN** elle est marquée `non_rattachee` et n'est attribuée à aucune campagne

#### Scenario: Only UTMs are available

- **WHEN** seuls les paramètres `utm_*` sont présents
- **THEN** le rattachement est de niveau `utm_seul`, la campagne est résolue si le mapping est certain, et le niveau atteint est affiché

### Requirement: A first-party touchpoint carries the identifiers through the funnel

Le système SHALL capturer les paramètres d'arrivée dans un touchpoint first-party à durée de vie bornée, SHALL le rattacher au lead créé et SHALL le transporter jusqu'au booking et jusqu'à Stripe.

#### Scenario: Visitor lands then books later

- **WHEN** un visiteur arrive depuis une publicité puis réserve un appel dans la fenêtre de vie du touchpoint
- **THEN** le rendez-vous porte l'identifiant de la publicité d'origine, quelle que soit la page de réservation utilisée

#### Scenario: Booking goes through Calendly or iClosed

- **WHEN** la réservation passe par un outil externe
- **THEN** le touchpoint est transmis en champ caché ou paramètre d'URL et relu au webhook, sans exposer de données personnelles supplémentaires

#### Scenario: Payment closes the loop

- **WHEN** un paiement Stripe est créé pour un lead rattaché
- **THEN** l'identifiant du lead ou de la session est écrit dans les `metadata` Stripe et permet de remonter jusqu'à la publicité

### Requirement: Attachment level and coverage are exposed

Le système SHALL exposer le niveau de rattachement atteint parmi `ad`, `adset`, `campaign`, `utm_seul` et `non_rattachee`, et SHALL afficher la couverture par niveau sur la période analysée.

#### Scenario: Partially instrumented account

- **WHEN** seule une partie des formulaires transporte le touchpoint
- **THEN** Minaly affiche la part rattachée par niveau, et indique ce qu'il faut instrumenter pour l'améliorer

### Requirement: Cash-dependent readings are gated by coverage

Le système SHALL geler les métriques et insights dépendant du cash lorsque la couverture de rattachement est sous le seuil configuré, et SHALL en donner la raison.

#### Scenario: Coverage is too low for a CAC reading

- **WHEN** moins que le seuil configuré des ventes de la période est rattachable
- **THEN** le CAC cash affiche `—` avec la couverture mesurée, et aucun insight fondé sur le cash n'est produit

### Requirement: Touchpoints hold no personal data

Le système SHALL ne stocker dans un touchpoint que des identifiants de campagne, des paramètres UTM et des horodatages. Le système SHALL NOT y stocker de donnée personnelle, ni la propager dans les URL de suivi.

#### Scenario: Touchpoint is inspected

- **WHEN** un touchpoint est lu par le serveur ou journalisé
- **THEN** il ne contient ni email, ni nom, ni identifiant de session utilisateur
