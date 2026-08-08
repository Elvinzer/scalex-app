# Décisions techniques

## Contexte et objectif

Le produit possède déjà deux briques séparées :

1. `conversations` et `agent_chat_messages` historisent les échanges Falco par compte ;
2. `insightRecords`, `improvementInitiatives` et le Journal portent le cycle d'exécution.

La change ajoute le pont entre ces briques. Elle ne redéfinit ni le domaine des initiatives, ni le stockage du transcript, ni les permissions existantes.

Le résultat attendu est un parcours fermé :

```text
conversation Falco
  → proposition structurée facultative
  → validation éditable
  → sauvegarde explicite comme insight todo
  → lancement optionnel dans le Journal
  → suivi / terminaison / retour à la conversation
```

## Contrats existants à respecter

- `InsightSourceType` contient `copilote`.
- `InsightDecision` contient `todo`, `launched`, `later`, `dismissed` et `completed`.
- `InitiativeStatus` contient notamment `planned`, `in_progress`, `paused`, `completed`, `awaiting_measurement`, `measured` et `cancelled`.
- `launchInsight` est la seule porte de lancement et garantit déjà l'unicité d'une initiative par insight, la cible tâche/projet, l'échéance, l'affectation et la priorité hebdomadaire.
- L'initiative créée est normalisée vers `in_progress` par le chemin actuel ; la spec parle donc de l'état observable `Lancé` pour l'insight et réutilise le libellé d'initiative existant dans le Journal.

## Décision 1 — Un contrat de capture dédié

Le client ne transmet pas un simple `{ sourceType, sourceId }` pour une action éditée. Il appelle un contrat de capture Copilote validé par Zod :

```text
{
  conversationId: UUID,
  title: string 1–120,
  problem: string 1–800,
  actionText: string 1–2 000,
  successCriterion: string 1–1 000
}
```

Le serveur :

1. authentifie l'utilisateur et résout son compte ;
2. vérifie que `conversationId` appartient à ce compte ;
3. lit le sujet depuis la conversation, sans faire confiance au libellé envoyé par le client ;
4. crée ou retourne l'insight Copilote avec `decision: "todo"` ;
5. conserve `problem`, `actionText` et `successCriterion` dans un snapshot versionné `{ kind: "copilote", version: 1, ... }`.

`title` et `actionText` sont également projetés vers les colonnes existantes utilisées par l'exécution et le Journal. Le critère n'est pas recalculé par l'agent au lancement.

Rejeté : faire passer les textes édités par l'adaptateur générique qui reconstruit une recommandation depuis une source externe. Cela ferait perdre la version validée par l'utilisateur et permettrait au client de choisir une source non canonique.

## Décision 2 — Une proposition structurée, jamais du parsing de texte

La réponse Falco continue d'être affichée et historisée comme un message normal. Lorsqu'une action est formulable, le flux peut aussi émettre un événement structuré, par exemple :

```text
{
  type: "falco_insight_proposal",
  conversationId,
  title,
  problem,
  actionText,
  successCriterion
}
```

L'événement est validé côté serveur et côté client. Il est accepté uniquement pour la conversation active et pour la réponse en cours. Un événement manquant, malformé, trop long, hors conversation ou interrompu ne fait pas échouer le message : il ne rend simplement aucune carte.

Falco ne calcule pas de métriques. Les chiffres affichés dans une proposition doivent provenir des faits calculés côté serveur déjà injectés dans son contexte. Une proposition peut rester qualitative lorsque le critère n'est pas calculable automatiquement.

Rejeté : parser des titres ou des marqueurs Markdown dans le texte assistant. Ce mécanisme est fragile, rend les erreurs silencieuses et mélange conversation et contrat de donnée.

## Décision 3 — Trois engagements séparés

Le bouton `Garder cette action` ouvre la validation locale. Il n'écrit rien. `Enregistrer l'insight` est le seul geste qui matérialise l'action, avec `decision: "todo"`. `Lancer dans le Journal` est ensuite un engagement distinct via `InsightLaunchDialog`.

Cette séparation permet de garder une bonne idée sans remplir le Journal et rend le moment de persistance explicite.

## Décision 4 — Une seule action persistée par conversation

La règle porte sur la durée de vie de la conversation, pas uniquement sur les états “actifs”. Une conversation possède au maximum un insight Copilote persisté : `todo`, `launched`, `later`, `dismissed` ou `completed`.

La base garantit cette règle avec une contrainte unique dédiée aux lignes dont `sourceType = "copilote"`, sur `(userId, sourceId)`. La sauvegarde est transactionnelle et idempotente : deux requêtes concurrentes retournent la même ligne, sans second insight. Le fingerprint existant reste la déduplication des autres sources.

Une action écartée peut être réactivée via le parcours existant ; elle ne permet pas de créer un deuxième insight dans la même conversation. Pour traiter un problème différent, l'utilisateur démarre une nouvelle conversation.

## Décision 5 — Brouillon local lié à la conversation

Les champs modifiés avant sauvegarde sont conservés dans `sessionStorage` sous une clé liée à l'identifiant de conversation. Le brouillon contient uniquement les quatre champs éditables, jamais le transcript, la clé API ou une donnée d'exécution.

- fermer le drawer conserve le brouillon ;
- rouvrir la même conversation le restaure exactement ;
- `Annuler` abandonne les modifications de l'état d'édition et nettoie le brouillon ;
- une sauvegarde réussie ou un abandon explicite nettoie le brouillon ;
- une conversation étrangère ne peut jamais être sauvegardée grâce au contrôle serveur.

Le code doit gérer l'absence de `sessionStorage`, les erreurs de quota et l'hydratation SSR sans bloquer le chat : dans ces cas, le brouillon reste au minimum dans l'état React de la surface montée.

## Décision 6 — Carte dans le fil, états lisibles

La carte est le dernier bloc de la réponse Falco concernée, pas une modale. Elle reste à sa place lorsqu'un nouveau message est envoyé.

États obligatoires : proposition, validation, enregistrement, conservé, lancé, terminé, vague, erreur et doublon. Chaque état porte un libellé écrit ; la couleur ne peut jamais être l'unique signal.

La carte utilise `--accent-2` pour signaler l'artefact Falco et `--accent` pour l'action métier prioritaire. Après lancement, aucun bouton corail n'est présent sur la carte ; les actions restantes ouvrent le Journal ou terminent l'action. Les composants utilisent les tokens et variantes de l'application, jamais de couleur brute.

## Décision 7 — Lancement et cycle de vie

Le dialog existant propose une tâche courte ou un projet, une échéance facultative, un responsable lorsque le rôle le permet et la priorité hebdomadaire cochée par défaut. L'annulation n'écrit ni initiative ni priorité.

Après confirmation réussie :

- l'insight passe à `launched` ;
- l'initiative est créée ou retrouvée par `launchInsight` et devient actionnable ;
- le Journal affiche l'action, son échéance et sa source ;
- une priorité hebdomadaire remplace l'ancienne priorité selon l'unicité déjà garantie.

La terminaison passe par les actions d'exécution existantes et synchronise la décision `completed`. `later` et `dismissed` utilisent également le cycle existant ; ils restent visibles dans l'historique avec leur état exact.

## Décision 8 — Deep-link explicite

Le lien `Voir la conversation` utilise `/copilote?conversation=<uuid>`. La page reconnaît ce paramètre en plus de `?topic` déjà existant, sélectionne la conversation après contrôle d'appartenance et conserve le comportement actuel pour les liens par sujet.

Un UUID absent, invalide ou appartenant à un autre compte ne révèle ni titre ni message. L'interface retombe sur Copilote sans sélection forcée et affiche un état générique non sensible.

## Décision 9 — Historique sans tableau de suivi

Chaque ligne d'historique contient le sujet, la date, le nombre de messages persistés et un indicateur d'action éventuel. L'association à l'insight est chargée en lot pour éviter une requête par ligne.

Les états sauvegardés sont exprimés en texte : `Action à traiter`, `Action lancée`, `Action à reprendre`, `Action écartée` ou `Action terminée`. Une conversation sans insight n'affiche rien mais conserve la même hauteur de ligne.

## Sécurité et confidentialité

- Toutes les actions et lectures restent account-scoped et vérifient la session côté serveur.
- Les champs édités, l'événement structuré et les paramètres de deep-link sont validés par Zod.
- Le snapshot Copilote ne contient pas le transcript complet ; il contient uniquement les champs validés nécessaires à l'action.
- Les logs ne contiennent ni transcript, ni clé, ni contenu sensible ; la consommation de tokens suit la règle existante.
- Les liens et mutations ne font jamais confiance à un `sourceLabel`, un `userId` ou un accès déclaré par le client.

## Risques et mitigation

**Qualité de la proposition.** Le prompt doit distinguer un conseil d'une action testable. Un état vague est une sortie valide ; les fixtures de test couvrent les deux cas.

**Journal trop rempli.** La priorité est unique mais les insights peuvent être nombreux. Aucun plafond arbitraire n'est ajouté avant les données d'usage ; le lien d'origine et les états permettent néanmoins de reprendre ou écarter une action.

**Données historiques déjà présentes.** La migration vérifie les doublons Copilote avant de créer la contrainte. Comme le chemin Copilote actuel ne matérialise aucune ligne, le cas nominal est vide ; si des lignes existent, la procédure conserve la plus ancienne sauvegarde et relie l'initiative existante avant suppression contrôlée du doublon.

## Vérification de conception

La maquette `maquette/Falco - Insight vers Journal.dc.html` est la référence visuelle des états et des dimensions. `design-tokens.md` et `microcopy.md` sont les références de tokens et de textes. Ils ne sont pas importés comme code : l'implémentation réutilise les composants, tokens et conventions de Scale X.
