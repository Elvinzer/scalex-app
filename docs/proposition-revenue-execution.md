# Proposition produit — Faire de Minaly la couche d’exécution commerciale

**Statut :** proposition à discuter  
**Décision proposée :** ne pas construire un CRM générique. Faire évoluer le Pipeline actuel en couche d’exécution commerciale pilotée par le diagnostic.

## Résumé exécutif

Minaly sait déjà identifier où un infopreneur perd du chiffre d’affaires. Le risque est qu’il reste ensuite à l’utilisateur de décider seul **qui contacter, quand, pourquoi et avec quel message**.

La proposition est de transformer le Pipeline existant en une boucle opérationnelle :

```text
Goulot détecté → action priorisée → fiche prospect contextualisée → action réalisée
→ résultat mesuré → diagnostic enrichi
```

Cette évolution peut augmenter la valeur quotidienne et la rétention de Minaly sans nous faire entrer frontalement dans la catégorie des CRM généralistes.

La recommandation est donc : **valider cette direction maintenant, puis lancer un MVP étroit autour des relances, des appels et du suivi des leads.**

## 1. Ce que l’application possède déjà

Le produit contient déjà une grande partie du socle CRM :

| Brique existante | Ce qu’elle permet déjà |
| --- | --- |
| Pipeline | Kanban de leads, étapes, valeur potentielle, source, offre, setter et closer |
| Fiche lead | Édition des informations, commentaires, rappels et historique des changements |
| Appels | Synchronisation iClosed / Calendly, présence, no-show, issue de l’appel, montant closé |
| Ventes | Lien entre un lead et une vente enregistrée |
| Dashboard | Actions en retard et prochaine action issue du diagnostic |
| Copilote | Conversation avec l’agent pour améliorer ce qui bloque |

Le problème n’est donc pas l’absence d’un CRM. Le problème est que les informations et les actions sont encore réparties entre plusieurs zones : Dashboard, Pipeline, Appels, Vente et Copilote.

## 2. Le problème utilisateur à résoudre

Un utilisateur peut savoir que son taux de closing est faible, ou qu’il a trop de no-shows, sans savoir immédiatement :

- quels prospects méritent son attention aujourd’hui ;
- quelle action est en retard ;
- ce qui s’est passé lors du dernier contact ;
- combien de chiffre d’affaires potentiel est bloqué ;
- quelle relance serait pertinente.

La fonctionnalité doit réduire cet écart entre **comprendre le problème** et **faire quelque chose qui le corrige**.

## 3. Positionnement proposé

> **Minaly ne remplace pas ton CRM. Il te dit qui faire avancer, pourquoi, et quelle action prendre pour récupérer ton cash.**

Ou, en formulation plus courte :

> **Le CRM d’exécution piloté par ton goulot business.**

Le mot CRM peut rester utile en interne, mais ce ne devrait pas être la promesse principale côté utilisateur. La promesse doit rester centrée sur le cash récupéré et la correction du goulot.

## 4. Concept produit : « À faire maintenant »

### 4.1 Une file d’actions unique

Créer une liste priorisée à partir des données déjà présentes :

1. décision de closing en attente ;
2. relance arrivée à échéance ;
3. no-show à récupérer ;
4. lead ouvert sans mouvement depuis trop longtemps ;
5. lead à forte valeur potentielle sans prochaine action ;
6. action recommandée par le diagnostic.

Chaque action doit afficher :

- le nom du prospect ;
- la raison de la priorité ;
- la valeur potentielle ;
- l’échéance ou l’ancienneté ;
- la source de l’information ;
- une action principale : **Ouvrir**, **Terminer** ou **Reporter**.

L’utilisateur ne doit pas avoir à interpréter un tableau pour comprendre quoi faire.

### 4.2 Une fiche relation unifiée

La fiche actuelle du lead est déjà une bonne base. Elle deviendrait le centre d’action avec :

- un en-tête clair : étape, valeur, priorité et prochaine action ;
- les informations du lead ;
- les appels associés ;
- les commentaires ;
- les rappels ;
- l’historique des changements ;
- la vente et le cash encaissé quand ils existent ;
- une recommandation de prochaine action ;
- un accès contextuel au Copilote.

L’objectif n’est pas d’ajouter davantage de champs. L’objectif est de réunir le contexte utile au moment où l’utilisateur agit.

### 4.3 Une action traçable

Une action doit pouvoir être :

- réalisée ;
- reportée à une date précise ;
- requalifiée ;
- commentée ;
- reliée à un changement d’étape.

Cela crée la boucle nécessaire pour mesurer si Minaly aide réellement à faire avancer les leads.

## 5. Évolution UX proposée

### Dashboard

Ne pas ajouter un nouveau bloc CRM au Dashboard. Les signaux existants « Actions en retard » et « Ta prochaine action » devraient évoluer vers un seul bloc :

### À faire maintenant

- 1 action prioritaire mise en avant ;
- 2 à 4 actions secondaires ;
- une raison lisible pour chaque action ;
- un CTA principal unique ;
- un lien « Voir tout dans le Pipeline ».

Cela évite de recréer plusieurs listes concurrentes, alors que l’app vient justement d’être simplifiée.

### Acquisition → Pipeline

Conserver Pipeline comme point d’entrée principal. Ne pas ajouter « CRM » dans la sidebar.

Proposer une vue interne simple :

```text
À faire aujourd’hui | Kanban | Funnel journalier
```

- **À faire aujourd’hui** devient la vue par défaut quand des actions sont dues ;
- **Kanban** conserve la gestion visuelle des étapes ;
- **Funnel journalier** reste la vue d’analyse existante.

La fonctionnalité doit prolonger Pipeline, pas créer une quatrième destination.

### Fiche lead

Transformer le drawer actuel en centre d’action :

```text
[Nom du lead]  [Étape]  [Valeur]

Prochaine action
Pourquoi cette action est prioritaire
[Ouvrir Copilote] [Terminer] [Reporter]

Timeline : lead → appel → commentaire → rappel → vente
```

Les actions importantes doivent être visibles sans parcourir toute la fiche.

### Vente → Appels

Les décisions en attente et les no-shows doivent alimenter la même file d’actions. Il ne faut pas recopier une seconde liste complète dans Appels : la page conserve son rôle de suivi des appels, tandis que le Dashboard et Pipeline deviennent les lieux d’action.

### Mobile et accessibilité

- Sur desktop : Kanban conservé.
- Sur mobile : privilégier une liste par étape ou une vue « À faire », plutôt qu’un Kanban horizontal difficile à manipuler.
- Les cartes doivent avoir une action explicite, pas uniquement une zone cliquable ou un drag-and-drop.
- Tous les contrôles doivent avoir un état focus, un retour de succès et une erreur affichée au bon endroit.
- Les couleurs ne doivent jamais être le seul moyen de distinguer une priorité.
- Utiliser les icônes vectorielles déjà présentes et respecter les tokens de la DA.

## 6. MVP recommandé

### Dans le périmètre

- génération d’actions à partir des rappels, appels en attente, no-shows et leads stagnants ;
- file « À faire maintenant » sur Dashboard et Pipeline ;
- priorité explicable : « en retard », « forte valeur », « sans mouvement », etc. ;
- actions « Terminer » et « Reporter » ;
- fiche lead avec timeline unifiée ;
- lien fiable entre lead, appel et vente quand l’identité est connue ;
- bouton Copilote avec le contexte du lead ;
- mesure du taux d’actions réalisées et de l’évolution des conversions.

### Hors périmètre

- CRM généraliste avec entreprises, objets personnalisés et champs illimités ;
- boîte mail, SMS, WhatsApp ou séquences multicanales ;
- remplacement de HubSpot, GoHighLevel, Close ou d’un outil déjà utilisé par le client ;
- synchronisation bidirectionnelle avec tous les CRM externes ;
- envoi automatique de messages sans validation de l’utilisateur ;
- nouvelle section lourde dans la navigation principale.

Le MVP doit rester utile même avec des leads saisis manuellement et sans intégration supplémentaire.

## 7. Exemple d’utilisation

1. L’utilisateur ouvre le Dashboard.
2. Il voit : « 4 actions à faire — 2 décisions en attente, 1 no-show, 1 lead à 8 000 € sans mouvement depuis 6 jours. »
3. Il ouvre le lead le plus prioritaire.
4. Il voit le dernier appel, les commentaires, la valeur potentielle et la raison de la priorité.
5. Le Copilote lui propose une relance contextualisée.
6. L’utilisateur réalise ou reporte l’action.
7. Il met à jour l’étape du lead.
8. Le résultat revient ensuite dans le funnel et le diagnostic.

## 8. Priorisation de roadmap

| Initiative | Valeur | Effort | Décision |
| --- | --- | --- | --- |
| File d’actions priorisées | Élevée | Moyen | À lancer en premier |
| Timeline lead / appel / vente | Élevée | Moyen | À lancer ensuite |
| Suggestions de relance par le Copilote | Élevée | Moyen à élevé | Après validation du flux |
| CRM complet | Incertaine | Très élevé | Ne pas lancer maintenant |
| Email/SMS/WhatsApp natifs | Potentiellement élevée | Très élevé | Plus tard, selon la demande |
| Sync avec CRM externes | Élevée pour certains profils | Élevé | Après preuve d’usage |

## 9. Comment décider si on lance

La direction mérite d’être lancée si les utilisateurs confirment au moins trois points :

- ils utilisent réellement le Pipeline ou veulent l’utiliser ;
- des leads restent bloqués faute de relance ou de suivi ;
- les décisions en attente et les no-shows représentent un manque à gagner identifiable ;
- ils ne veulent pas forcément changer de CRM, mais veulent mieux exécuter ;
- ils accepteraient une file d’actions quotidienne comme point de départ.

À l’inverse, si la demande principale est « construisez-moi un HubSpot avec emailing, automatisations et inbox », il vaut mieux intégrer les outils existants que construire un CRM complet.

## 10. Indicateurs de succès

### Adoption

- utilisateurs qui ouvrent la file d’actions chaque semaine ;
- nombre d’actions terminées ou reportées ;
- leads possédant une prochaine action ;
- utilisation de la fiche relation et du Copilote.

### Exécution

- diminution des actions en retard ;
- réduction du nombre de leads stagnants ;
- délai entre une action due et son traitement ;
- décisions en attente et no-shows récupérés.

### Business

- évolution du taux de conversion des leads suivis ;
- évolution du cash encaissé associé aux leads ;
- valeur potentielle débloquée par étape du funnel.

### Garde-fous

- ne pas augmenter fortement la saisie manuelle ;
- ne pas créer de doublons entre Dashboard, Pipeline et Appels ;
- ne pas ajouter de nouvelle couleur ou de nouveau système visuel hors DA ;
- ne pas transformer Minaly en outil d’administration commerciale.

## Décision proposée à l’associé

> Nous ne lançons pas un CRM généraliste. Nous faisons de Minaly la couche qui transforme le diagnostic en actions commerciales concrètes. Nous commençons par une file « À faire maintenant » reliée au Pipeline, aux appels et aux ventes, puis nous ajoutons la timeline et les suggestions du Copilote uniquement si l’usage est confirmé.

**Recommandation : valider la direction produit, interviewer quelques utilisateurs sur leurs relances et no-shows, puis prototyper ce flux avant de développer.**

