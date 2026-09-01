# Architecture implémentée — CRM Minaly

Statut : V1 implémentée, migrations appliquées et parcours contrôlés localement
le 1 septembre 2026.

Ce document décrit l’architecture livrée du module CRM et de l’extension Chrome.
Les décisions métier prises par le owner du produit et les règles du repository
restent prioritaires sur tout document de handoff design. Les exigences normatives
et la checklist de réalisation sont dans `openspec/changes/add-crm-lead-capture/`.

## 1. Objectif et positionnement

Le CRM est une couche opérationnelle de prospection et de vente dans Minaly. Il
centralise les leads issus d’Instagram et de LinkedIn, les étapes de conversation,
les actions à réaliser, les appels et les résultats commerciaux.

Le CRM n’est pas :

- un CRM généraliste avec enrichissement externe ;
- une boîte d’envoi automatisé de messages ;
- une nouvelle source de vérité pour les rendez-vous, les appels ou les ventes ;
- un module obligatoire pour tous les comptes Minaly.

Le CRM est un module optionnel par entreprise. Il est activé ou désactivé par le
owner de l’entreprise et peut être activé après l’onboarding.

## 2. Principes d’architecture

### 2.1 Une seule source de vérité

Les écrans CRM sont des projections opérationnelles de données métier partagées.
Ils ne doivent pas créer une seconde version :

- du pipeline existant ;
- des actions de relance ;
- des appels iClosed, Calendly ou manuels ;
- des rendez-vous ;
- des ventes et de leur attribution.

Les sources existantes à réutiliser sont notamment :

- lib/leads/ pour les leads, l’historique et les commentaires existants ;
- lib/dashboard/revenue-actions.ts pour le moteur d’actions à généraliser ;
- lib/iclosed/ et lib/calendly/ pour les appels ;
- app/(app)/ventes/rdv/ pour la réservation et l’agenda ;
- app/(app)/ventes/suivi/ pour les ventes et les paiements ;
- lib/team/ pour les rôles, le contexte de compte et les permissions.

Le contrat de synchronisation partagé intègre les projections CRM sans dupliquer
les calculs. Le rapport de migration et les contrôles sont dans
`docs/crm-migration-report.md`.

### 2.2 Isolation par entreprise

Un lead ne peut être reconnu et affiché que dans l’entreprise qui l’a créé.

La correspondance principale d’un profil social est :

~~~
accountId + platform + canonicalProfileUrl
~~~

Le pseudo ou le nom affiché sont des signaux secondaires. Le nom seul ne doit
jamais identifier automatiquement un lead.

Un même profil social utilisé par deux entreprises représente deux leads distincts.
En V1, un profil Instagram et un profil LinkedIn ne sont pas automatiquement
fusionnés, même s’ils semblent appartenir à la même personne. Un rapprochement
manuel pourra être ajouté plus tard.

### 2.3 Séparation des responsabilités

Le système distingue :

- le responsable actuel du lead ;
- l’utilisateur qui réalise une action ;
- l’utilisateur qui capture le profil depuis l’extension ;
- le closer associé à un appel ou à une vente ;
- l’owner de l’entreprise ;
- l’administrateur interne Minaly.

Le responsable actuel ne doit pas être déduit de l’auteur de la dernière activité.
Une activité conserve toujours son auteur historique.

## 3. Architecture de navigation cible

### 3.1 Navigation desktop

Le CRM est une entrée de premier niveau immédiatement après Dashboard :

~~~
Dashboard
CRM
  Aujourd’hui
  Pipeline
  Leads
  Actions
  Appels
Roadmap
Diagnostic
Datas
Acquisition
  Contenu
  Newsletter
  Ads
Ventes
  Suivi des ventes
  Rendez-vous
Délivrabilité
Copilote
~~~

Le CRM ne doit pas être placé sous Acquisition ou Ventes.

Les routes cibles sont :

- /crm : Aujourd’hui ;
- /crm/pipeline ;
- /crm/leads ;
- /crm/actions ;
- /crm/appels.

Les anciennes URLs doivent rester compatibles :

- /ventes/pipeline devient un alias ou une redirection vers /crm/pipeline ;
- /ventes/appels devient un alias ou une redirection vers /crm/appels.

La page financière /ventes/suivi et la gestion des rendez-vous /ventes/rdv restent
dans Ventes.

### 3.2 Navigation mobile

Lorsque le CRM est actif et accessible, la barre principale mobile devient :

~~~
Dashboard | CRM | Diagnostic | Datas | Ventes
~~~

Roadmap reste disponible dans le menu latéral mobile.

Lorsque le CRM est désactivé, la navigation actuelle est conservée.

### 3.3 Points d’intégration dans le repository

La navigation livrée s’appuie sur :

- components/app-sidebar.tsx pour l’entrée desktop et mobile ;
- lib/nav/pillar-subpages.ts pour les sous-pages ;
- app/(app)/ventes/layout.tsx pour retirer les anciennes entrées Pipeline et
  Appels de la navigation Ventes ;
- app/(app)/settings/equipe/ pour la gestion des rôles et accès ;
- `app/(app)/settings/modules/crm/` pour l’activation owner-only.

## 4. Modules et responsabilités des pages

### CRM > Aujourd’hui

Vue d’exécution quotidienne avec :

- KPI de période ;
- actions en retard ;
- actions du jour ;
- actions à venir ;
- sections Prospection, Vente et Rendez-vous ;
- bascule Mes actions / Vue équipe selon les permissions.

### CRM > Pipeline

Vue Kanban des cinq étapes de prospection. Les résultats No-show, Perdu et Vendu
restent des attributs de la carte, pas des colonnes.

### CRM > Leads

Vue de recherche et de filtrage de tous les leads de l’entreprise.

### CRM > Actions

Vue de toutes les actions ouvertes ou terminées, incluant les relances. Les
catégories sont :

- Prospection ;
- Vente ;
- Rendez-vous.

Les relances sont un type ou un filtre d’action, pas une page parallèle.

### CRM > Appels

Vue opérationnelle des appels liés aux leads. Elle réutilise les données
existantes de salesCalls et les intégrations iClosed, Calendly et manuelles.

### Ventes > Rendez-vous

Reste la source de vérité pour la réservation, l’agenda et la reprogrammation.
Le CRM affiche les actions et le contexte du lead, mais ne recrée pas la gestion
du calendrier.

### Ventes > Suivi des ventes

Reste la source de vérité financière pour les ventes, le CA, les paiements et
les commissions.

## 5. Modèle de domaine cible

### 5.1 Compte entreprise

Le compte entreprise est le périmètre de sécurité et de visibilité du CRM.
Dans l’architecture actuelle, il est représenté par le compte owner et résolu
par le contexte d’équipe existant.

Chaque lecture et chaque mutation CRM doit être associée à un accountId résolu
côté serveur. L’utilisateur courant sert à tracer l’action, pas à limiter
la visibilité des leads lorsque l’utilisateur possède l’accès CRM.

### 5.2 Lead

En V1, un lead représente une identité sociale suivie par une entreprise.

Champs fonctionnels cibles :

- accountId ;
- platform ;
- canonicalProfileUrl ;
- normalizedHandle ;
- displayName ;
- firstName, facultatif ;
- lastName, facultatif ;
- offerId, facultatif ;
- source ;
- setterId / responsable courant ;
- crmStage ;
- crmOutcome ;
- isNoShow ;
- actions CRM ouvertes ;
- createdAt ;
- updatedAt.

Le lead peut être relié à des appels, des ventes, des notes, des activités et
des actions. Il ne doit pas contenir uniquement l’état courant : les changements
importants doivent être historisés.

### 5.3 Activité

Une activité est un événement append-only associé au lead :

- profil capturé ;
- premier message détecté ;
- réponse traitée ;
- contenu de valeur envoyé ;
- appel proposé ;
- appel booké ;
- changement de statut ;
- ajout de note ;
- création ou clôture d’action ;
- no-show ;
- vente validée ;
- réassignation.

Une activité contient au minimum :

- accountId ;
- leadId ;
- actorUserId ;
- type ;
- occurredAt, lorsque l’événement social est daté ;
- capturedAt, lorsque l’événement est observé par Minaly ;
- metadata validée et non sensible ;
- createdAt.

### 5.4 Historique de statut

L’historique de statut conserve :

- ancien statut ;
- nouveau statut ;
- actorUserId ;
- responsable du lead au moment du changement ;
- source de la mutation : application ou extension ;
- date du changement.

Le responsable courant peut changer sans réécrire l’historique.

### 5.5 Actions

Une action est une tâche opérationnelle rattachée à un lead.

Champs fonctionnels cibles :

- leadId ;
- accountId ;
- category : prospection, vente ou rendez-vous ;
- type ;
- title ;
- dueAt ;
- status : à faire, terminée, annulée ;
- priority ;
- responsibleUserId ;
- createdByUserId ;
- completedAt ;
- completedByUserId ;
- createdAt ;
- updatedAt.

Le modèle supporte plusieurs actions historiques et plusieurs actions ouvertes.
Les cartes et Aujourd’hui affichent une prochaine action principale par lead,
sans masquer les autres actions dans CRM Actions.

### 5.6 Notes d’équipe

Les notes sont partagées avec les membres autorisés de l’entreprise.
Il n’existe pas de note privée en V1.

### 5.7 Responsabilité et réassignation

Le responsable courant est une relation vers un membre/setter de l’entreprise.
Une table ou un journal de réassignation conserve :

- ancien responsable ;
- nouveau responsable ;
- auteur de la réassignation ;
- date ;
- raison facultative.

Recommandation : les actions de prospection ouvertes suivent le nouveau
responsable. Les actions terminées, l’historique, les appels réalisés et les
ventes ne sont jamais réattribués rétroactivement.

### 5.8 Appels et ventes

Les appels existants doivent être reliés à un lead lorsque la correspondance
est fiable. Le modèle actuel de salesCalls ne possède pas nécessairement de
leadId sur toutes les lignes : le raccordement des appels historiques est donc
un sujet de migration distinct.

La validation d’une vente reste une action métier autorisée au closer assigné,
au manager ou à l’owner. Les données financières continuent de provenir de
la source ventes existante.

## 6. Machine d’état métier

### 6.1 Étapes du pipeline

Les seules étapes de pipeline sont :

1. 1er message envoyé ;
2. Conversation en cours ;
3. Contenu de valeur envoyé ;
4. Appel proposé ;
5. Appel booké.

Tous les utilisateurs CRM peuvent changer l’étape depuis l’application ou
l’extension.

### 6.2 Résultats

Les résultats sont séparés de l’étape :

- aucun résultat ;
- no-show ;
- perdu ;
- vendu.

Un no-show n’entraîne pas automatiquement le statut perdu.

### 6.3 Réouverture

À la réouverture d’un lead perdu :

- la dernière étape connue est proposée par défaut ;
- l’utilisateur peut choisir une autre étape ;
- le résultat perdu est retiré ou remplacé selon l’action confirmée ;
- l’historique de la perte et de la réouverture est conservé.

### 6.4 Aucun automatisme commercial silencieux

Le CRM ne passe pas automatiquement un lead en perdu faute de réponse.
Une action de relance peut être proposée, mais la décision de perte reste
manuelle en V1.

## 7. Architecture de l’extension Chrome

### 7.1 Principe

L’extension est une extension Chrome Manifest V3 avec un content script limité
aux pages pertinentes d’Instagram et de LinkedIn.

Elle lit uniquement les informations visibles dans le DOM de la page :

- plateforme ;
- URL du profil ;
- pseudo ;
- nom affiché ;
- avatar si disponible ;
- date/heure du message si visible ;
- contexte profil ou conversation.

Elle n’utilise pas l’API Meta ou l’API LinkedIn pour le CRM et ne réalise aucun
envoi automatique de message.

### 7.2 États de l’extension

La machine d’état cible est :

~~~
page pertinente détectée
  → bouton flottant fermé
  → clic utilisateur
  → profil inconnu | profil connu | correspondance incertaine
~~~

Sur une page non pertinente, aucun bouton ne doit apparaître.

Chaque création ou mise à jour doit être confirmée explicitement par
l’utilisateur. Aucun enregistrement silencieux ne doit être effectué.

### 7.3 Correspondance

L’extension envoie au serveur une identité normalisée. Le serveur réalise la
recherche dans le seul accountId de l’utilisateur connecté.

Le serveur retourne l’un des états :

- unknown ;
- known ;
- ambiguous ;
- inaccessible ou CRM désactivé.

L’extension ne reçoit jamais une liste de leads d’une autre entreprise.

### 7.4 Champs capturés et dates

Les dates doivent rester distinctes :

- messageOccurredAt : date visible du message social ;
- capturedAt : date à laquelle Minaly observe la page ;
- createdAt : date de création effective du lead.

Pour un profil inconnu avant confirmation, createdAt n’existe pas encore.
L’interface doit afficher une création prévue ou ne montrer cette date
qu’après confirmation.

Si aucun message n’est visible, l’extension ne doit pas inventer de
messageOccurredAt.

### 7.5 Permissions de l’extension

Dans l’extension :

- le statut est modifiable par tous les utilisateurs CRM ;
- les champs simples sont modifiables ;
- les notes et actions peuvent être ajoutées ;
- le responsable est toujours en lecture seule ;
- la réassignation est impossible ;
- la validation d’une vente n’est pas disponible dans l’extension.

## 8. Permissions et autorisation serveur

La permission d’accès au CRM est distincte de l’activation du module.

- crmEnabled est un état account-level contrôlé par l’owner ;
- crm:view contrôle l’accès au module pour les membres ;
- crm:assign permet la réassignation ;
- crm:manage-pipeline permet de modifier la structure ;
- crm:view-team permet la vue équipe ;
- crm:validate-sale est attribuée au closer autorisé, au manager et à l’owner.

Tous les contrôles doivent être appliqués côté serveur, dans les Server Actions
ou route handlers concernés. L’interface ne doit jamais être la seule barrière.

Matrice cible :

| Capacité | Setter | Closer | Manager | Owner | Extension |
|---|---:|---:|---:|---:|---:|
| Voir tous les leads de l’entreprise | Oui | Oui | Oui | Oui | Profil détecté uniquement |
| Modifier le statut | Oui | Oui | Oui | Oui | Oui |
| Modifier nom, prénom, offre, source | Oui | Oui | Oui | Oui | Oui |
| Ajouter une note ou une action | Oui | Oui | Oui | Oui | Oui |
| Marquer no-show, perdu ou rouvrir | Oui | Oui | Oui | Oui | Non |
| Réassigner le responsable | Non par défaut | Non par défaut | Oui | Oui | Non |
| Modifier la structure du pipeline | Non | Non | Oui | Oui | Non |
| Vue équipe | Non par défaut | Non par défaut | Oui | Oui | Non |
| Valider une vente | Non, sauf closer assigné | Oui si assigné | Oui | Oui | Non |
| Activer ou désactiver le CRM | Non | Non | Non | Oui | Non |

La visibilité de tous les leads ne signifie pas que tous les utilisateurs
voient par défaut la file d’actions de toute l’équipe. La vue personnelle reste
la vue initiale dans Aujourd’hui.

## 9. Flux applicatifs

### 9.1 Capture d’un nouveau profil

~~~
Profil social
  → Content script
  → Normalisation de l’identité
  → Résolution tenant-scoped
  → Préremplissage de la carte
  → Confirmation utilisateur
  → Transaction de création du lead
  → Activité de capture
  → Première action éventuelle
  → Projection CRM et KPI
~~~

La commande de création doit être idempotente. Un double clic ou une nouvelle
détection de la même page ne doit pas créer deux leads.

### 9.2 Visite d’un profil connu

~~~
Profil social
  → Résolution dans le compte courant
  → Résumé du lead connu
  → Modification éventuelle du statut ou des champs simples
  → Activité historisée
  → Mise à jour d’actions et KPI
~~~

Le responsable existant reste inchangé.

### 9.3 Correspondance incertaine

La carte présente le profil visité et le candidat trouvé. L’utilisateur doit
choisir explicitement :

- confirmer la correspondance ;
- créer un nouveau lead.

Une confirmation doit produire une activité historisée.

## 10. KPIs et projections

Les KPI sont calculés en code à partir des événements et sources métier. Ils
ne sont pas pré-agrégés par un modèle de langage.

KPIs cibles :

- messages envoyés ;
- réponses ;
- conversations ;
- contenus de valeur envoyés ;
- appels proposés ;
- appels bookés ;
- appels honorés ;
- no-shows ;
- ventes validées.

Projections :

- Aujourd’hui pour l’exécution ;
- CRM par setter ;
- CRM par équipe ;
- Dashboard et Diagnostic selon les besoins existants.

Recommandation d’attribution :

- activité : utilisateur qui réalise l’action ;
- étape : responsable au moment du changement ;
- appel : closer/setter selon la source canonique de l’appel ;
- vente : source ventes existante ;
- équipe : leads uniques atteignant l’événement dans la période.

Formules initiales à valider :

- taux de réponse = conversations / premiers messages ;
- taux de contenu = contenus envoyés / conversations ;
- taux d’appel proposé = appels proposés / contenus envoyés ;
- taux de prise de call = appels bookés / appels proposés ;
- taux de présence = appels honorés / appels bookés ;
- taux de no-show = no-shows / appels bookés ;
- taux de closing = ventes validées / appels honorés.

Politique V1 : la cohorte contient les leads dont le premier événement
first_message_sent tombe dans la période choisie. Les milestones sont comptés
sur des leads uniques jusqu'à la date de consultation, avec la période de
cohorte et la date de mise à jour affichées. Une réouverture ou une capture
répétée ne crée pas une nouvelle conversion.

## 11. Fiabilité, sécurité et confidentialité

### Sécurité

- session vérifiée côté serveur pour les pages CRM et les endpoints extension ;
- RLS sur toutes les tables CRM user/account-scoped ;
- validation Zod de tout payload venant de l’extension ;
- accountId dérivé du contexte serveur, jamais accepté aveuglément du client ;
- aucune donnée d’un autre compte dans une réponse de résolution ;
- journalisation des mutations sensibles ;
- aucun secret ou token de session dans les logs ;
- séparation stricte entre owner de compte et administrateur interne Minaly.

### Idempotence

Une capture extension doit fournir une clé d’idempotence dérivée de l’identité
normalisée et du contexte d’événement. Les replays réseau ne doivent pas
dupliquer les leads, activités ou actions.

Les synchronisations d’appels et de ventes restent re-run safe selon les règles
déjà applicables aux webhooks et jobs existants.

### Résilience extension

Prévoir les états :

- DOM non reconnu ;
- profil partiellement capturé ;
- message absent ;
- session expirée ;
- CRM désactivé ;
- absence de réseau ;
- réponse serveur lente ;
- correspondance ambiguë.

Une évolution du DOM Instagram ou LinkedIn doit dégrader la capture proprement,
sans créer de données incomplètes silencieusement.

### Conservation

La durée de conservation n’est pas chiffrée dans ce document. Elle devra suivre
la politique légale applicable et prévoir archivage, suppression, export et
restauration lorsque ces opérations seront spécifiées.

## 12. Migration de l’existant

La migration est séparée de la création de nouvelles fonctions et a été livrée
dans les migrations 0050 à 0054. Le détail des volumes contrôlables, des clés
stables et du rollback est dans `docs/crm-migration-report.md`.

Mapping indicatif des anciens statuts :

| Ancien statut | Cible proposée |
|---|---|
| nouveau_lead | 1er message envoyé |
| conversation | Conversation en cours |
| rdv_fixe | Appel booké |
| rdv_honore | Appel booké + appel honoré |
| close | Appel booké + vendu |
| perdu | dernière étape connue + perdu |

Autres migrations :

- reminderDate, reminderNote et reminderDone deviennent des actions ;
- leadComments devient des notes d’équipe ;
- leadStageHistory devient ou alimente l’historique unifié ;
- isNoShow est conservé comme résultat ;
- setterId est remappé vers responsibleSetterId après vérification du lien
  avec le membre d’équipe ;
- les appels historiques sont reliés aux leads seulement lorsque la
  correspondance est suffisamment fiable.

Chaque règle est additive et rejouable. Les migrations ont été générées,
inspectées puis appliquées sur la base partagée ; les appels historiques restent
non reliés tant qu’une association fiable n’est pas confirmée.

## 13. Décisions V1 implémentées

Les choix ci-dessous sont les décisions techniques implémentées dans la V1.
Les sujets de conservation et de raccordement manuel des appels restent ouverts
pour la mise en production.

| Sujet | Décision V1 | Conséquence attendue |
|---|---|---|
| Période et cohorte KPI | Les bornes sont des jours calendaires en UTC dans la V1. La cohorte contient les leads dont le premier événement `first_message_sent` tombe dans la période. Les milestones sont comptés une fois par lead jusqu’à la date de consultation. | Stocker les dates en UTC et afficher explicitement la période, le fuseau UTC, la cohorte et la date de calcul. |
| Actions ouvertes | Plusieurs actions ouvertes sont autorisées pour un lead. Aujourd’hui affiche une action principale déterminée par échéance puis priorité ; CRM Actions affiche la totalité. Aucun plafond métier n’est imposé en V1. | Ne pas utiliser un champ de relance unique sur le lead et ne pas masquer les actions secondaires. |
| Réassignation | Les actions de prospection ouvertes suivent le nouveau responsable. Les actions terminées, événements, appels et ventes gardent leur attribution historique. | Une réassignation ne modifie jamais rétroactivement les KPI ni l’auteur d’une activité. |
| Création manuelle | Un lead peut être créé depuis l’application ou l’extension. Les deux flux utilisent la même commande transactionnelle et la même clé de déduplication. | La capture manuelle ne contourne ni l’isolation compte ni les règles d’idempotence ; aucun enrichissement externe n’est ajouté. |
| Authentification extension | Une page Minaly authentifiée émet une session d’extension courte via échange explicite. Le service worker conserve uniquement le jeton court, renouvelable par ré-authentification ; la session Supabase brute n’est jamais copiée. | La révocation intervient à l’expiration, à la désactivation du CRM, à la rotation du secret ou à la déconnexion explicite. |
| Identité Instagram/LinkedIn | Les identités restent séparées en V1. Une similarité inter-plateforme peut seulement produire `ambiguous`; aucune fusion automatique n’est faite. | Une fusion future sera un changement de modèle distinct, avec audit et consentement explicite. |
| Offres et sources | Les offres et sources sont des options account-scoped. Une valeur absente reste nullable ; un identifiant d’un autre compte est refusé côté serveur. | Les listes de sélection sont filtrées par compte et les événements conservent le contexte utile sans copier de données sensibles. |
| Appels historiques | Un appel est lié à un lead uniquement par association explicite et fiable. Les appels non reliés restent dans la source canonique et ne créent pas de lead par déduction. | Les anciennes lignes sont mesurées dans un rapport de raccordement avant toute migration automatique. |
| Fuseau horaire | Le CRM V1 utilise UTC pour les périodes KPI, les échéances et les dates affichées. Un fuseau configurable par compte fera l’objet d’un changement post-V1. | Les comparaisons de date ne dépendent pas du fuseau du navigateur de l’utilisateur ; l’interface affiche le périmètre en UTC. |
| Conservation | Aucune purge destructive n’est introduite par le CRM V1. La durée de conservation, l’archivage, l’export et la suppression doivent suivre la politique légale applicable et constituent une condition de mise en production. | Les migrations et le rollback conservent les événements ; une suppression future fera l’objet d’un changement dédié. |

Les contrats de frontière et la checklist de validation associée sont détaillés
dans `docs/crm-api-contract.md` et `docs/crm-implementation-readiness.md`.

## 14. Découpage livré et suites

Les lots 1 à 5 ci-dessous sont livrés. Les suites sont séparées du périmètre V1 :

### Lot 0 — spécification et entrée en développement (livré)

- valider les décisions V1 et la condition de conservation ;
- faire relire l’OpenSpec, le contrat API et la checklist de readiness ;
- définir le contrat de données, la migration et le plan de rollback ;
- confirmer les contrôles de sortie et le plan de pilote.

### Lot 1 — fondations CRM (livré)

- flag account-level CRM ;
- permissions ;
- navigation et routes ;
- projections de leads et pipeline.

### Lot 2 — actions et appels (livré)

- moteur d’actions partagé ;
- Aujourd’hui ;
- Actions ;
- Appels ;
- raccordement des données existantes.

### Lot 3 — extension (livré)

- capture DOM Instagram ;
- résolution tenant-scoped ;
- création et mise à jour confirmées ;
- états inconnu, connu, ambigu et fermé.

### Lot 4 — KPIs et migration (livré)

- événements et attribution ;
- KPI setter/équipe ;
- migration de l’existant ;
- contrôles de cohérence.

### Lot 5 — validation (livré localement)

- tests de permissions et isolation entreprise ;
- tests d’idempotence ;
- vérification UX responsive ;
- vérification runtime et régression.

## 15. Suites post-V1

- maintenir les adaptateurs DOM Instagram/LinkedIn au fil des changements de
  leurs interfaces ;
- définir la durée de conservation et le parcours d’archivage/export avec la
  politique légale ;
- associer manuellement les appels historiques restants lorsque la preuve
  d’identité est disponible ;
- supprimer les champs legacy uniquement dans un changement séparé après
  validation en production.
