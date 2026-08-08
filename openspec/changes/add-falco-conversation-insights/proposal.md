# Proposition — Transformer une conversation Falco en action suivie

## Pourquoi

Une conversation Falco peut déjà diagnostiquer un problème et suggérer une piste. Elle ne donne toutefois pas encore à l'utilisateur un point d'atterrissage fiable : l'action exacte à retenir se perd dans le fil, n'est pas historisée comme décision et ne rejoint pas naturellement le Journal.

Le socle d'exécution existe déjà dans `lib/insight-execution/` : un insight peut être matérialisé, lancé comme tâche ou projet, affecté, planifié et marqué terminé. Les conversations sont également persistées dans `conversations` et `agent_chat_messages`. La change relie ces deux capacités sans créer un second système de tâches.

## Ce qui change

- Falco peut émettre une proposition structurée en fin de réponse lorsqu'il dispose d'un problème, d'une action testable et d'un critère de réussite.
- La proposition est visible dans le fil, puis passe par une étape d'édition avant toute écriture serveur.
- « Enregistrer l'insight » sauvegarde le texte réellement validé par l'utilisateur et crée une décision `todo` rattachée à la conversation.
- Une seule proposition persistée est autorisée par conversation ; les répétitions et les doubles clics retournent l'insight existant.
- L'insight peut ensuite être lancé avec le dialog `InsightLaunchDialog` déjà utilisé par le Journal.
- Le Journal reprend le titre, l'action, le problème, le critère de réussite, la source Falco et un lien vers la conversation exacte.
- L'historique des conversations affiche un indicateur d'action et conserve une densité de liste identique pour les conversations sans insight.
- Le brouillon édité survit à la fermeture du drawer, sans persister le transcript ni écrire en base avant la confirmation.

## User stories couvertes

- En tant qu'utilisateur, je veux repartir d'une conversation avec une action précise à implémenter, afin de ne pas rester avec un conseil abstrait.
- En tant qu'utilisateur, je veux corriger le titre, l'action et le critère avant sauvegarde, afin que l'insight corresponde exactement à mon intention.
- En tant qu'utilisateur, je veux retrouver l'action dans le Journal avec son origine, afin de savoir pourquoi je la fais et comment vérifier sa réussite.
- En tant qu'utilisateur, je veux rouvrir la conversation depuis le Journal ou l'historique, afin de reprendre le raisonnement sans repartir de zéro.
- En tant qu'utilisateur, je veux qu'une proposition vague ou un échec technique ne crée pas de fausse tâche, afin de garder un Journal exploitable.

## Contrat de sauvegarde

Le parcours client utilise un contrat dédié de capture Copilote, validé côté serveur :

```text
conversationId   UUID de la conversation courante
title            1–120 caractères
problem          1–800 caractères
actionText       1–2 000 caractères
successCriterion 1–1 000 caractères
```

Le serveur vérifie que la conversation appartient au compte courant, dérive lui-même le libellé `Falco · {sujet}`, et persiste `sourceType: "copilote"` et `sourceId: conversationId`. Le titre et `actionText` alimentent les colonnes d'exécution existantes ; les quatre champs sont aussi conservés dans un snapshot Copilote versionné. Le client ne peut pas choisir le compte, le libellé de source ou une conversation étrangère.

La sortie structurée de Falco est un événement optionnel du flux de réponse. Le client ne parse jamais le Markdown pour fabriquer une carte. Si l'événement est absent, invalide, expiré ou rattaché à une autre conversation, la réponse normale reste affichée et aucune carte n'est créée.

## Compatibilité et migration

La change est non cassante pour les parcours existants, mais nécessite une migration interne : une contrainte unique dédiée aux lignes `copilote` garantit un seul insight par compte et conversation, avec RLS et index adaptés. Les autres sources conservent leur déduplication par fingerprint.

Le lancement réutilise `launchInsight` et ses transitions existantes. Après succès, l'insight devient `launched` et l'initiative est dans l'état d'exécution retourné par le service existant (`in_progress` aujourd'hui) ; l'interface affiche `Lancé` et ne crée pas un nouveau vocabulaire de statut.

## Capacités affectées

- `falco-insight-capture` — nouvelle capacité de proposition, édition et sauvegarde explicite.
- `insight-execution` — prise en charge réelle de la source `copilote`, idempotence et cycle de vie.
- `journal` — action issue de Falco, critère de réussite et retour vers la conversation.
- `falco-conversation-history` — indicateur d'action, compteur de messages et accès à l'action existante.

## Impact technique

- `db/schema.ts` et une migration Drizzle pour l'unicité Copilote et les index nécessaires.
- `lib/insight-execution/` pour le snapshot typé, le contrat Zod, la capture et les projections.
- Le flux SSE de Falco pour l'événement optionnel de proposition structurée.
- `components/falco/` et le drawer/page Copilote pour les états proposal, édition, sauvegarde, lancement et suivi.
- `app/(app)/copilote/` pour le deep-link `?conversation=<id>`.
- `app/(app)/journal/` et l'historique pour les sources et retours.

## Hors périmètre

- Sauvegarde ou lancement automatique sans geste explicite de l'utilisateur.
- Plusieurs insights persistés dans une même conversation ; un nouveau problème doit ouvrir une nouvelle conversation.
- Mesure automatique de l'impact, déjà couverte par `MeasurementSnapshot`.
- Version anglaise.
- Copie du HTML de la maquette dans l'application : la maquette reste une référence visuelle.
