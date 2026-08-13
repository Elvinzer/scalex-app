## Context

Le produit possède déjà plusieurs familles d’insights : `funnel_stage_insights` conserve les réponses et textes générés par le Copilote, les recommandations de contenu ont leur propre statut, et le Diagnostic calcule des points et leviers à chaque lecture. Le Journal possède déjà `projects`, `todos` et `improvement_events`, mais aucun lien durable ne relie une recommandation à une initiative ni à un résultat.

Le changement `add-revenue-execution-actions` a volontairement conservé une projection commerciale en lecture seule. Cette change ajoute l’état d’exécution des recommandations dans un modèle séparé, sans transformer la projection de revenu en source de vérité transverse.

## Goals / Non-Goals

**Goals:**

- Donner à l’utilisateur une mémoire fiable de ce que Minaly lui a recommandé et de ce qu’il a décidé.
- Faire de `Je lance cette action` un passage court vers une tâche ou un projet du Journal.
- Garantir une seule priorité hebdomadaire, tout en autorisant plusieurs initiatives historiques ou en attente.
- Mesurer automatiquement les métriques comparables et présenter un impact honnête, sans attribuer causalement tout le CA à Minaly.
- Permettre au propriétaire d’assigner une initiative à un membre d’équipe actif et à ce membre de la faire avancer dans ses droits.
- Donner à Falco un contexte de relance basé sur l’initiative réelle, pas un conseil générique répété.

**Non-Goals:**

- Construire un modèle `contacts`, une inbox ou un CRM généraliste.
- Remplacer les tables métier existantes par une table générique de métriques.
- Récompenser les ouvertures de pages, les clics ou la saisie artificielle de tâches.
- Ajouter un score de santé concurrent du Scale Score, une monnaie virtuelle ou un classement public entre comptes.
- Promettre un `cash récupéré` lorsque la source ou la formule ne permet qu’une projection ou une évolution observée.
- Envoyer automatiquement des messages commerciaux à un prospect ou un client.

## Decisions

### 1. Séparer l’historique de l’insight et l’initiative d’exécution

Créer deux concepts persistants :

- `insight_records` : snapshot normalisé d’une recommandation actionnable, sa source (`diagnostic_metric`, `diagnostic_lever`, `funnel_stage`, `content_recommendation` ou `copilote`), son texte, ses données de référence et sa décision utilisateur ;
- `improvement_initiatives` : action lancée depuis un insight, son statut, son échéance, son responsable, sa priorité hebdomadaire, sa cible Journal et son résultat.

Cette séparation permet de conserver les insights non lancés et d’éviter qu’un projet supprimé fasse disparaître l’historique de la recommandation. Les identifiants de source restent des pointeurs contrôlés côté serveur, pas des données sensibles renvoyées sans filtrage.

Alternative écartée : ajouter uniquement un booléen `implemented` sur chaque source. Cela ne permet ni les statuts intermédiaires, ni les initiatives multi-étapes, ni l’assignation, et le funnel possède déjà un booléen historique qui ne couvre pas les autres sources.

### 2. Matérialiser les insights sans les dupliquer à chaque rendu

Un insight est écrit dans `insight_records` lorsqu’il est généré, ouvert comme recommandation actionnable ou accepté par l’utilisateur. Le serveur calcule une empreinte stable à partir de la source, de la période, de la métrique et de la version de recommandation ; deux lectures identiques ne créent pas deux records.

Les anciennes lignes `funnel_stage_insights` restent conservées. Leurs écrans actuels peuvent créer ou retrouver le record normalisé correspondant, tandis que `implemented` reste un champ de compatibilité pendant la migration vers le statut d’initiative.

### 3. Réutiliser le Journal comme cible, pas comme source de vérité

`Je lance cette action` ouvre un choix minimal : `Tâche courte` ou `Projet`. La mutation crée ou lie le todo/projet du Journal et crée une `improvement_initiative`. Le calendrier continue de lire `improvement_events`, qui devient une trace dérivée des transitions importantes : lancement, jalon terminé, action terminée et résultat mesuré.

Une initiative peut avoir au plus une cible directe de type tâche ou projet dans la première tranche. Une initiative reliée à un projet peut ensuite utiliser les jalons déjà existants. La suppression d’une tâche ou d’un projet ne supprime jamais l’insight ni le résultat déjà enregistré.

### 4. Enforcer le focus hebdomadaire par une table dédiée

Le focus est une relation `compte + semaine ISO → initiative`, avec une contrainte d’unicité. Changer de priorité clôt le focus de la semaine précédente sans supprimer l’initiative ; l’historique reste donc visible dans les semaines passées.

Cette relation est préférable à un simple booléen sur l’initiative : elle permet de comparer les semaines et garantit réellement une seule priorité active par semaine, même après un double clic ou deux onglets ouverts.

### 5. Assigner à un membre d’équipe, sans nouvelle hiérarchie de rôles

L’initiative référence `team_members.id`, pas uniquement `memberUserId`, afin de rester assignable pendant le cycle d’invitation. En première version, le propriétaire assigne ; un membre actif peut consulter et mettre à jour une initiative s’il a le Dashboard et la permission de la surface métier concernée. Les règles existantes restent la source de vérité pour Pipeline, Appels, Diagnostic et Rendez-vous.

L’interface affiche le membre et ses rôles existants, mais ne crée pas de catégories codées `setter`, `closer` ou `opérateur` dans le nouveau modèle.

### 6. Capturer le baseline au lancement et mesurer uniquement ce qui est comparable

Le baseline est calculé côté serveur au moment où l’action est lancée : clé de métrique, période, valeur, unité, benchmark éventuel, CA de référence et date de fraîcheur. Il n’est jamais reconstruit après coup à partir de données modifiées.

À la revue, le moteur recalcule la même métrique sur une période comparable et stocke un résultat immuable : valeur avant, valeur après, delta, période, source et niveau de confiance. Les taux sont présentés en points de pourcentage ; le cash est présenté comme `impact observé` ou `gain estimé post-action` sauf si une attribution déterministe est disponible. Les insights sans métrique comparable peuvent être terminés, mais ne passent à `Résultat mesuré` qu’avec un résultat qualitativement enregistré et explicitement étiqueté.

Alternative écartée : demander à Falco d’estimer le résultat depuis une conversation. Les sommes, taux, deltas et gains restent calculés en code conformément aux règles du produit.

### 7. Faire de la progression une conséquence des actions significatives

Le Dashboard et le Journal affichent un bloc `Élan de la semaine` fondé sur le focus courant : non lancé, en cours, terminé ou mesuré. La progression compte les transitions métier, jamais les vues ou les clics. Les célébrations sont limitées aux premiers jalons et aux résultats mesurés ; elles respectent `prefers-reduced-motion`.

Le classement entre comptes, les points et les niveaux sont explicitement hors périmètre. Une comparaison personnelle `cette semaine / semaine précédente` suffit pour la première version.

### 8. Relancer avec Falco sans harceler

Falco peut rappeler une initiative dans le Dashboard et le briefing hebdomadaire existant lorsque la priorité est en attente, approche de son échéance ou n’a pas bougé depuis la dernière revue. Une initiative en pause, écartée, terminée ou mesurée ne génère plus de relance. La fréquence est limitée à une relance par initiative et par fenêtre hebdomadaire, avec une action `Reporter` ou `Mettre en pause` persistante.

Les jobs sont idempotents : un rerun ne crée ni doublon de nudge ni événement de progression supplémentaire. Aucun envoi automatique de message commercial n’est ajouté.

## Risks / Trade-offs

- **[Trop de types d’insights dès la première version]** → commencer avec les insights Diagnostic/Funnel et les recommandations déjà structurées ; brancher les conversations libres uniquement quand elles possèdent une action explicite.
- **[Fausse promesse de causalité sur le CA]** → afficher la provenance, la période et le libellé `observé`/`estimé`; retourner `non calculable` quand la formule n’est pas déterministe.
- **[Double vérité entre Journal et initiative]** → initiative comme source d’état d’exécution ; todo/projet comme surface Journal ; événements comme journal dérivé.
- **[Membre assigné sans accès à la donnée]** → filtrage serveur par compte et permission avant toute lecture ou mutation ; ne jamais déduire un accès de la seule assignation.
- **[Gamification qui pousse à créer des micro-tâches]** → une seule priorité hebdomadaire, progression basée sur des transitions importantes et absence de points par clic.
- **[Relances répétitives]** → fréquence bornée, snooze persistant, déduplication idempotente et suppression automatique après mesure.

## Migration Plan

1. Créer les tables et enums de la nouvelle boucle avec RLS, index account-scoped et contraintes d’unicité.
2. Ajouter les adaptateurs qui retrouvent ou matérialisent un insight normalisé depuis les sources existantes.
3. Ajouter les actions de décision, de lancement, de liaison Journal, d’assignation et de focus hebdomadaire.
4. Afficher l’historique et l’Élan dans Diagnostic, Dashboard et Journal sans nouvelle entrée de navigation.
5. Ajouter les snapshots de baseline/résultat et le job de relance hebdomadaire idempotent.
6. Conserver les anciens champs (`funnel_stage_insights.implemented`) en lecture compatible jusqu’à validation d’usage ; aucun backfill aveugle des conversations libres.

Rollback : masquer les nouvelles surfaces et désactiver les jobs de relance ; les données historiques, projets, todos et sources métier restent intactes. Les anciennes actions d’insight continuent de fonctionner.

## Open Questions

- Les insights de conversations libres doivent-ils entrer dans l’historique uniquement après un clic `Je lance`, ou dès qu’une recommandation structurée est extraite ? La première tranche peut limiter l’entrée aux cartes et insights déjà structurés.
- Le propriétaire doit-il pouvoir assigner une action à un membre invité non encore actif ? Recommandation : non, seulement `active`, afin d’éviter une file qui ne peut pas être traitée.
