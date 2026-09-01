# Rapprochement des appels CRM

Statut : V1 implémentée, migration appliquée et parcours contrôlé localement le
1 septembre 2026.

Ce document décrit le fonctionnement livré pour les appels iClosed, Calendly,
les rendez-vous Minaly et les appels manuels qui ne sont pas encore reliés à un
lead.

## Source de vérité

- `sales_calls` reste la source canonique de l'appel et de son identité.
- `crm_call_links` reste la seule association appel-lead confirmée.
- `crm_call_match_suggestions` conserve une tentative de rapprochement sans
  modifier l'appel ni le lead.
- `crm_call_match_candidates` conserve au maximum les trois candidats affichés,
  avec leur rang, leur niveau de revue, leurs raisons et les éléments manquants.

La référence externe affichée est `sales_calls.iclosedCallId`. Elle est
présente dans chaque ligne, tronquée visuellement si nécessaire, entièrement
accessible au survol et copiable. La page affiche également le nom de l'invité,
les coordonnées disponibles, la source, le type d'appel, la durée, la date et
l'heure planifiées, le responsable ou le closer et le statut de liaison.

## Lecture et recherche

`/crm/appels` propose une recherche account-scoped sur :

- nom de l'invité et identité du lead déjà relié ;
- email et téléphone ;
- référence fournisseur ;
- type d'appel.

Les filtres portent sur la source, les appels non reliés, la présence, le
résultat, l'état Falco et une période `from` / `to`. La table desktop conserve
une largeur minimale pour ne pas mélanger l'identité de l'appel avec celle du
lead. La version mobile utilise des cartes empilées et reprend les mêmes
informations dans le même ordre de décision.

Les valeurs absentes sont affichées comme indisponibles. `scheduledAt` est
toujours présenté sous le libellé « Date/heure de l'appel » ; il n'est pas
présenté comme la date de création de l'enregistrement.

## Génération d'une suggestion

La génération suit ce chemin :

```text
appel non relié
  -> candidats du compte courant, cinq maximum
  -> normalisation et classement déterministe
  -> Falco reçoit l'identité minimale du candidat
  -> réponse JSON validée par Zod
  -> suggestion et candidats persistés
  -> revue humaine
  -> liaison confirmée ou refusée
```

Le classement utilise, quand ils existent, l'email, le téléphone, le profil,
le nom, la proximité temporelle, la plateforme et l'attribution. Un nom seul
reste faible et ne peut jamais produire une confiance élevée. Falco ne reçoit
pas les valeurs brutes d'email ou de téléphone : il reçoit les champs utiles à
la revue et des indicateurs de présence pour les coordonnées.

Les réponses acceptées sont `candidate`, `ambiguous`, `no_match` et
`unavailable`. Les états persistés couvrent également `queued`, `failed`,
`expired`, `accepted`, `rejected` et `dismissed`. Une suggestion est valable
sept jours pour les états révisables ; son empreinte change si l'identité de
l'appel ou la shortlist déterministe change.

Falco n'est jamais appelé au rendu de la page. Une demande individuelle est
déclenchée par « Chercher un lead ». Les nouveaux appels importés sont placés
dans la file Inngest. Le bouton d'analyse historique place au maximum 25 appels
non reliés dans cette même file et rend le nombre effectivement envoyé ; il ne
crée aucun lien automatiquement.

## Décision humaine et idempotence

La confirmation revalide dans une transaction :

1. la suggestion appartient au compte et à l'appel demandé ;
2. le candidat appartient au même compte ;
3. l'appel est toujours présent et non relié ;
4. le candidat est bien enregistré dans la suggestion ;
5. aucun autre lien n'a été créé entre-temps.

En cas de succès, `crm_call_links.accepted_suggestion_id` pointe vers la
suggestion et un événement `match_confirmed` conserve la méthode, la confiance,
la suggestion et l'acteur. Un lien concurrent n'est jamais écrasé. Le rejet ou
l'ignorance ne modifie ni le lead, ni le résultat d'appel, ni la source
canonique.

Le rapprochement manuel reste disponible à côté de chaque suggestion. Il passe
par le même contrôle account-scoped et la même contrainte d'unicité par appel.

## Permissions, confidentialité et observabilité

- La lecture dépend de l'accès CRM de la session courante.
- La demande d'analyse est autorisée avec l'accès CRM.
- La confirmation, le rejet, l'ignorance et le lancement du batch historique
  exigent `crm:assign`.
- Les policies RLS des deux tables vérifient le compte, l'appel canonique et,
  pour les candidats, le compte du lead.
- Les clés BYOK/shared-key et le quota agent existants sont réutilisés.
- Les réponses Falco passent par Zod avant toute persistance ou affichage.
- Les logs de génération contiennent le statut, le fournisseur, le nombre de
  tokens entrée/sortie, le nombre de candidats et la durée ; ils ne contiennent
  pas d'email, de téléphone, de référence brute ou de réponse Falco complète.

## Vérification et rollback

Contrôles réalisés localement :

- migration Drizzle `0055_sticky_kang.sql` puis migration additive
  `0056_concerned_microbe.sql` générées et appliquées ;
- page `/crm/appels` contrôlée en desktop et en viewport mobile ;
- recherche par nom, filtre source et états de suggestion contrôlés ;
- une génération réelle contrôlée a produit un état `no_match` persistant sans
  créer de liaison ;
- tests de normalisation, classement, empreinte et parsing Falco ajoutés.

Pour désactiver la fonctionnalité, couper l'émission des jobs et masquer les
actions de génération/confirmation au niveau des actions serveur. Les appels,
les liens existants, les suggestions et l'audit restent conservés. Aucune
suppression de données n'est nécessaire au rollback.
