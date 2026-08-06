## Why

Scale X sait déjà repérer un goulot business, mais les actions commerciales restent réparties entre le Dashboard, le Pipeline, le suivi des appels et les Rendez-vous. Le changement natif de réservation ajoute déjà des prospects abandonnés à relancer : c’est le moment de rendre ces signaux visibles dans une même file d’actions, sans lancer un CRM générique ni fusionner prématurément les modèles métier.

## What Changes

- Ajouter une projection account-scoped des actions de revenu à partir des sources existantes : rappels de leads, décisions de closing en attente, no-shows et prospects de réservation native non convertis.
- Afficher sur le Dashboard un bloc `À faire maintenant`, priorisé et explicable, avec une action principale et un lien vers la surface source.
- Séparer les actions commerciales des alertes techniques existantes (clé API, synchronisation d’intégration) afin qu’elles ne se concurrencent pas dans la même liste.
- Ajouter des liens profonds vers le lead, l’appel ou le prospect natif lorsque la surface source le permet, avec focus visuel et contexte conservé.
- Respecter les permissions de chaque source : une action ne doit apparaître que si l’utilisateur peut ouvrir sa destination.
- Conserver le statut dans sa source d’origine : le premier périmètre ne crée ni table `contacts` ni table générique `follow_up_actions`.
- Ne pas ajouter de nouvelle entrée `CRM` ou `Relances` dans la navigation principale.

## Capabilities

### New Capabilities

- `revenue-action-aggregation`: projection priorisée et account-scoped des actions commerciales issues des leads, appels et Rendez-vous.
- `revenue-action-center`: surface Dashboard `À faire maintenant`, navigation vers les contextes sources et exigences d’accessibilité/responsive.

### Modified Capabilities

Aucune capacité existante n’est modifiée au niveau de ses exigences. Le changement dépend des contrats livrés par `add-native-booking-scheduler`, notamment `native_booking_leads` et la page `Ventes → Rendez-vous`.

## Impact

- Requêtes et types de lecture du Dashboard, notamment le calcul actuel des actions en retard.
- Données existantes de `leads`, `sales_calls` et `native_booking_leads` ; aucune migration de schéma prévue pour cette tranche.
- Pages sources `/acquisition/pipeline`, `/ventes/appels` et `/ventes/rdv` pour accepter un contexte ciblé depuis le Dashboard.
- Permissions d’équipe et filtrage account-scoped déjà utilisés par Scale X.
- Tests de comportement et de responsive avec `agent-browser`, sans nouvelle dépendance externe.
- Le changement doit être appliqué après ou avec une version compatible de `add-native-booking-scheduler`, qui est encore en cours d’implémentation.
