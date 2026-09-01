## Context

Le changement traverse la navigation, les leads, les actions, les appels, les
permissions, les KPI et une extension Chrome. Le détail métier est défini dans
proposal.md et dans les cinq capacités de specs de ce changement. Ce document
fixe la manière de l'intégrer à l'architecture actuelle de Minaly avant toute
implémentation.

L'application utilise déjà :

- le contexte d'équipe et de compte de lib/team/ ;
- les leads, leur historique et leurs commentaires dans lib/leads/ ;
- les actions consommées par le Dashboard dans lib/dashboard/revenue-actions.ts ;
- les appels iClosed, Calendly et manuels dans lib/iclosed/, lib/calendly/ et
  le modèle salesCalls ;
- les rendez-vous et les ventes sous app/(app)/ventes/ ;
- Supabase Auth, RLS, Drizzle et les migrations comme mécanismes de sécurité et
  de persistance.

Le modèle actuel ne doit pas être remplacé en bloc : il contient des leads avec
des statuts historiques, un setterId, des relances et des appels qui ne sont
pas toujours reliés à un lead. Le CRM doit donc être introduit de façon
additive, derrière un flag de module, avec des adaptateurs de compatibilité.

## Goals / Non-Goals

**Goals:**

- Créer un bounded context CRM centré sur l'identité sociale d'un lead,
  l'historique, les actions et les projections.
- Garder une seule source de vérité pour les appels, rendez-vous, ventes et
  données financières existantes.
- Garantir l'isolation par accountId, y compris dans la résolution faite par
  l'extension.
- Rendre les cinq étapes du pipeline, les résultats et les responsabilités
  cohérents dans l'application et l'extension.
- Permettre une activation progressive et une migration réversible des données
  existantes.
- Calculer les KPI à partir d'événements métier auditables, sans pré-agrégation
  par un modèle de langage.
- Préparer une extension Manifest V3 qui capture le DOM visible et ne peut pas
  envoyer de message social.

**Non-Goals:**

- Ajouter une API Meta ou LinkedIn, de l'enrichissement externe ou une
  automatisation de messages.
- Recréer un calendrier, un système d'appels, une comptabilité ou une base de
  ventes à l'intérieur du CRM.
- Fusionner automatiquement les identités Instagram et LinkedIn.
- Construire un moteur de scoring ou une attribution probabiliste fondée sur le
  seul nom.
- Supprimer immédiatement les anciens écrans, champs ou URLs.
- Remplacer immédiatement les champs legacy ou supprimer les alias : la V1
  reste additive et réversible.

## Decisions

### 1. Découper le CRM en noyau métier et projections

Le noyau CRM sera limité aux données dont il est propriétaire :

- identité sociale et qualification du lead ;
- étape de pipeline et résultats ;
- événements et historique ;
- responsabilité courante et historique des réassignations ;
- notes d'équipe ;
- actions opérationnelles ;
- liens explicites vers les appels et sources financières.

Les pages CRM seront des lectures composées de ce noyau et des sources
existantes. Le Dashboard, le Diagnostic et les autres vues qui consomment des
actions ou des KPI passeront par les mêmes services de projection.

Alternative écartée : copier les appels, rendez-vous ou ventes dans de
nouveaux objets CRM. Cela créerait deux états concurrents et rendrait les KPI
incohérents.

### 2. Utiliser une identité sociale tenant-scoped

Chaque lead CRM portera un accountId dérivé du contexte serveur, une plateforme
et une URL de profil canonique. La contrainte logique de déduplication sera :

~~~
(accountId, platform, canonicalProfileUrl)
~~~

L'URL sera normalisée par un adaptateur de plateforme avant toute résolution :
hostname autorisé, suppression des paramètres de tracking, normalisation du
chemin et du handle selon les règles de la plateforme. Le handle normalisé
reste un index secondaire. Le nom affiché ne sert jamais de clé automatique.

V1 ne fusionnera pas automatiquement un profil Instagram et un profil
LinkedIn. Une correspondance secondaire pourra seulement produire l'état
ambiguous et demander une confirmation.

Alternative écartée : une table globale de personnes ou une clé par nom. Elle
augmenterait le risque de fuite entre entreprises et ferait passer une
hypothèse d'identité pour un fait.

### 3. Ajouter un modèle CRM canonique sans écraser l'historique legacy

La migration sera additive :

- conserver les champs legacy nécessaires aux anciennes lectures pendant la
  transition ;
- introduire un état CRM canonique avec des codes stables indépendants des
  libellés FR/EN ;
- exposer les cinq étapes cibles comme seule machine d'état CRM ;
- conserver les anciennes valeurs dans l'historique ou une projection de
  compatibilité, sans les réutiliser comme nouvelles étapes ;
- faire converger les écrans vers le modèle canonique avant de retirer les
  champs legacy dans un changement séparé.

Les codes de stockage seront séparés des libellés traduits :

~~~
first_message_sent
conversation_in_progress
value_content_sent
call_proposed
call_booked
~~~

Les résultats seront séparés de l'étape :

~~~
none | no_show | lost | sold
~~~

Le no-show et le sold seront aussi reliés aux événements d'appel ou de vente
quand ces sources sont disponibles. Un changement de setter ne modifiera
jamais l'étape courante, les résultats ou les événements passés.

Alternative écartée : remplacer directement l'enum legacy stage. Une mutation
destructive risquerait de casser les lectures actuelles et de perdre le sens
des anciennes valeurs comme rdv_honore ou close.

### 4. Faire des événements et historiques les preuves auditables

Les mutations importantes écriront un événement append-only dans la même
transaction que la mutation métier :

- capture ou création ;
- changement d'étape ;
- résultat no-show, perdu, vendu ou rouvert ;
- note ajoutée ;
- action créée, terminée ou annulée ;
- réassignation ;
- confirmation d'une correspondance ambiguë.

Chaque événement portera accountId, leadId, actorUserId, source,
occurredAt lorsqu'une date sociale existe, capturedAt lorsqu'une page est
observée, createdAt, et un metadata payload validé. Les données sociales
capturées ne seront pas déposées dans des logs applicatifs.

L'historique d'étape conservera également l'ancien et le nouvel état ainsi que
le responsable au moment du changement. Les événements provenant de l'extension
seront distincts de ceux provenant de l'application.

Alternative écartée : ne conserver que l'état courant et reconstruire le passé
à partir des updatedAt. Cette approche ne permettrait ni l'audit ni les KPI
attribués correctement après une réassignation.

### 5. Généraliser les actions au lieu de maintenir une page Relances séparée

Le modèle canonique d'action sera rattaché à un lead et contiendra catégorie,
type, titre, échéance, statut, priorité, responsable, créateur et informations
de complétion. Les catégories stables seront Prospection, Vente et
Rendez-vous ; une relance sera un type ou une propriété filtrable.

Le moteur de lib/dashboard/revenue-actions.ts deviendra un adaptateur ou une
projection du service d'actions CRM. Aujourd'hui consommera par défaut les
actions du membre connecté, tandis que Vue équipe appliquera une permission
distincte. Les actions de prospection ouvertes suivront le nouveau responsable ;
les actions terminées garderont leur responsable et leur acteur historiques.

Alternative écartée : conserver un champ de relance sur le lead et créer une
seconde liste d'actions. Cela ne permettrait pas plusieurs actions ouvertes,
l'historique complet ni une priorisation commune.

### 6. Raccorder les appels par association, sans copier leur contenu

CRM Appels lira les enregistrements canoniques iClosed, Calendly et manuels.
Le raccordement à un lead sera représenté par une association CRM auditable
vers l'identifiant de l'appel source, avec une unicité par compte, appel et
lead. L'association conservera son origine, son niveau de fiabilité, son
auteur et sa date.

Une ligne d'appel historique non reliée restera visible dans la source
existante et ne créera pas de lead par déduction. Les nouvelles associations
ne recopieront ni le statut ni le résultat de l'appel ; elles les liront depuis
la source canonique.

Alternative écartée : une deuxième table salesCalls propre au CRM. Elle
dupliquerait les webhooks et les règles idempotentes iClosed/Calendly.

### 7. Séparer l'activation du module des permissions de membre

Le flag crmEnabled sera porté par le compte entreprise et contrôlé seulement
par l'owner. Il sera distinct des permissions accordées aux membres :

~~~
crm:view
crm:view-team
crm:assign
crm:manage-pipeline
crm:validate-sale
~~~

Owner et manager recevront par défaut les droits d'administration CRM prévus
par les specs. Le closer ne validera une vente que s'il est autorisé et
concerné par le résultat. L'administrateur interne Minaly restera une notion
séparée des rôles du compte client.

Le serveur recalculera toujours accountId, état du module, appartenance,
permission et relation au lead. La navigation pourra masquer un contrôle, mais
elle ne sera jamais l'autorité.

Pour les anciennes URLs /ventes/pipeline et /ventes/appels, une redirection
vers les routes CRM sera préférée si elle ne casse pas les liens enregistrés ;
sinon un alias serveur finira par le même service. Les anciennes permissions
nécessaires aux parcours existants resteront comprises par l'adaptateur de
compatibilité durant la transition, sans devenir la nouvelle permission
canonique.

Alternative écartée : déduire l'accès CRM de advancedModulesEnabled ou du
simple rôle de membre. Le module doit être optionnel au niveau entreprise et
les droits métier doivent rester granulaires.

### 8. Introduire les routes CRM comme nouveau point de navigation

Les nouvelles pages seront regroupées sous app/(app)/crm/ :

~~~
/crm
/crm/pipeline
/crm/leads
/crm/actions
/crm/appels
~~~

components/app-sidebar.tsx et lib/nav/pillar-subpages.ts seront adaptés pour
placer CRM immédiatement après Dashboard et pour conserver la hiérarchie
mobile prévue par le handoff. app/(app)/ventes/layout.tsx ne présentera plus
Pipeline et Appels comme des sous-pages concurrentes de Ventes ; Suivi des
ventes et Rendez-vous resteront à leur emplacement.

Le layout CRM fera le contrôle d'accès côté serveur avant de rendre les pages.
Chaque page utilisera un service de lecture tenant-scoped plutôt que des
requêtes directes éparses.

Alternative écartée : déplacer physiquement les écrans actuels sans routes
compatibles. Les liens existants et les appels historiques continueraient de
pointer vers un parcours obsolète.

### 9. Définir un flux d'extension à session courte

L'extension sera Manifest V3 avec :

- content scripts limités aux routes de profils ou conversations supportées ;
- un adaptateur Instagram et un adaptateur LinkedIn ;
- une normalisation locale minimale ;
- un service worker pour l'état, l'authentification et les appels serveur ;
- une carte compacte et un bouton flottant rendu dans la page.

L'extension ne recevra pas la session Supabase navigateur brute. Le raccordement
sera réalisé par une page Minaly authentifiée et un échange à usage unique,
lié à l'instance d'extension, qui délivre une session courte renouvelable par
ré-authentification explicite. Les tokens d'extension ne seront pas imprimés
dans les logs et leur durée, révocation et stockage seront traités comme des
secrets de session.

Le flux serveur sera séparé en deux commandes :

1. resolve : reçoit une identité normalisée et retourne unknown, known,
   ambiguous ou unavailable dans le seul compte courant ;
2. capture/update : reçoit la décision confirmée et applique la mutation
   autorisée dans une transaction idempotente.

La commande capture/update n'acceptera pas un accountId choisi par le client.
Pour une correspondance ambiguous, le serveur vérifiera que le candidat
sélectionné appartient au contexte de résolution et au compte courant.

Alternative écartée : donner à l'extension un token Supabase permanent ou une
API de réseau social. Le premier élargirait l'impact d'un vol de token ; la
seconde contredirait la contrainte de capture DOM visible.

### 10. Rendre les captures idempotentes et temporellement explicites

Une capture confirmée comportera une clé d'idempotence liée à l'identité
normalisée, au compte et au contexte observé. Les activités répétées utiliseront
un sourceEventKey pour empêcher un double comptage sans empêcher un nouvel
événement social réellement distinct.

Les dates seront persistées séparément :

- messageOccurredAt : date d'un message ou événement visible ;
- capturedAt : instant où l'extension a observé la page ;
- createdAt : instant de création effective du lead.

Avant confirmation d'un profil inconnu, l'interface ne présentera pas
createdAt comme si le lead existait déjà. Elle pourra afficher une date
anticipée explicitement libellée.

Les mutations de création et de mise à jour respecteront le même contrat que
l'application : Zod à la frontière, autorisation côté serveur, transaction,
événement historique et réponse validée côté extension.

### 11. Fixer la politique KPI V1

Les KPI seront produits par une couche de requêtes ou de services déterministes,
sans appel LLM. Les comptes opérationnels de la période sélectionnée seront
fondés sur des événements uniques. Les sources de ventes et d'appels resteront
canoniques.

La politique de cohorte V1 sera :

- une cohorte contient les leads dont le premier événement
  first_message_sent se situe dans la période choisie ;
- les conversions sont calculées sur des leads uniques de cette cohorte ;
- les milestones atteints sont comptés une seule fois, jusqu'à la date de
  consultation, avec la période de cohorte clairement affichée ;
- les taux du funnel utilisent les dénominateurs du milestone précédent ;
- une réouverture ou une nouvelle capture ne crée pas une nouvelle conversion ;
- l'activité est attribuée à actorUserId ;
- l'étape est attribuée au responsable au premier événement qualifiant, tandis
  que le responsable actuel reste affiché séparément.

Cette règle permet de distinguer un compteur d'activité dans la période d'une
conversion de cohorte qui peut se finaliser après le premier message. Les
valeurs indisponibles ou incomplètes seront affichées comme telles.

Alternative écartée : calculer les taux à partir des seuls champs courants du
lead. Une réassignation, une réouverture ou une capture répétée modifierait les
résultats historiques.

### 12. Appliquer la sécurité en défense en profondeur

Chaque table CRM sera account-scoped avec RLS. Les policies vérifieront
l'appartenance au compte et, lorsque nécessaire, l'accès au module. Les
mutations sensibles ajouteront le contrôle de permission côté serveur, car RLS
ne suffit pas à exprimer toute la logique owner/manager/closer.

Les endpoints d'extension auront :

- validation stricte des payloads ;
- rate limiting et taille maximale de payload ;
- expiration et révocation de session ;
- idempotency key obligatoire pour les écritures ;
- réponses minimales, sans liste globale de leads ;
- erreurs qui ne révèlent pas l'existence d'un lead d'un autre compte.

Les événements et KPI ne contiendront pas de données de session, de clé BYOK,
de token social ou de secret d'intégration. Les changements de schéma CRM
incluront les policies RLS dans la même migration et seront vérifiés par des
tests d'isolation.

## Risks / Trade-offs

- [DOM Instagram/LinkedIn instable] → Isoler les sélecteurs dans des adaptateurs
  versionnables, vérifier les champs obligatoires et afficher un état de
  capture partielle au lieu d'écrire silencieusement.
- [Profil sans URL canonique] → Ne pas auto-résoudre par le nom ; afficher
  unknown ou ambiguous et demander une décision explicite.
- [Fuite inter-entreprises lors de la résolution] → Dériver accountId de la
  session serveur, limiter la requête à ce compte, appliquer RLS et tester les
  réponses not-found.
- [Modèle legacy de leads incompatible avec les cinq étapes] → Migrer de façon
  additive, conserver la valeur historique et lire le nouvel état via un
  adaptateur avant toute suppression.
- [Appels historiques non reliables] → Ne créer que des associations explicites
  et conserver les appels non reliés dans leur source canonique.
- [Double comptage après retry ou réouverture] → Contraintes d'unicité,
  idempotency keys, sourceEventKey et requêtes KPI basées sur des leads uniques.
- [Responsable et acteur confondus] → Stocker les deux sur chaque événement et
  ne jamais recalculer l'acteur historique à partir du responsable courant.
- [Actions du Dashboard et actions CRM divergentes] → Faire du service d'actions
  CRM le modèle canonique et adapter la projection Dashboard.
- [Flag de module incohérent avec la navigation] → Contrôler crmEnabled dans le
  layout et les services serveur ; invalider les caches après activation ou
  désactivation.
- [Extension compromise] → Session courte, échange à usage unique, scopes
  limités, absence de session Supabase brute et ré-authentification explicite.
- [KPI difficile à expliquer] → Afficher période, cohorte, filtre, source,
  responsable et acteur pertinents ; rendre les valeurs incomplètes visibles.
- [Migration partiellement appliquée] → Découper les migrations en étapes
  additives, mesurer les lignes non résolues et garder le flag CRM désactivé
  jusqu'à validation.
- [Extension trop large pour une carte compacte] → Prioriser l'identité, le
  statut, le responsable en lecture seule, l'action suivante et les commandes
  autorisées ; renvoyer vers la fiche CRM pour le détail.
- [Dev et prod Supabase partagent la base] → Générer puis appliquer des
  migrations réversibles et vérifier chaque étape avant activation, sans
  utiliser db push.

## Migration Plan

1. Geler ce cadrage et vérifier les contrats de domaine, permissions, KPI et
   captures contre les cinq specs avant toute modification de code.
2. Ajouter les structures de données et policies RLS de façon additive, sans
   exposer la navigation CRM et avec des index tenant-scoped.
3. Backfiller accountId et les champs CRM des leads existants. Produire un
   rapport des leads sans identité sociale fiable au lieu de les fusionner par
   nom.
4. Mapper les statuts legacy vers les codes CRM :
   nouveau_lead vers first_message_sent, conversation vers
   conversation_in_progress, rdv_fixe et rdv_honore vers call_booked avec
   l'événement d'appel correspondant lorsque disponible, close vers call_booked
   avec le résultat sold, et perdu vers la dernière étape mappée avec le
   résultat lost. Conserver la valeur et l'événement legacy pour audit.
5. Transformer les relances existantes en actions avec une référence de source
   et une clé d'idempotence. Les commentaires et historiques existants seront
   copiés ou adaptés sans modifier leur auteur ni leur date.
6. Créer uniquement les associations d'appels fiables. Ne pas tenter de
   reconstituer un lead à partir d'un appel non identifiable.
7. Introduire les services serveur et les pages CRM derrière crmEnabled, puis
   brancher les anciennes routes sur les mêmes services.
8. Introduire la navigation conditionnelle et le parcours owner-only
   d'activation. Vérifier que la désactivation cache les surfaces sans effacer
   les données.
9. Déployer l'extension avec les états closed, unknown, known, ambiguous,
   unavailable et session expirée. Les écritures seront désactivées tant que
   le module ou la session ne sont pas valides.
10. Activer sur un compte pilote, vérifier isolation, idempotence, cohorte KPI,
    compatibilité des URLs et parcours mobile, puis élargir.

Rollback :

- désactiver crmEnabled pour empêcher les nouvelles mutations et masquer les
  surfaces ;
- conserver les tables, événements, associations et historiques pour reprise ;
- rétablir les anciennes lectures via l'adaptateur legacy si une projection CRM
  est défaillante ;
- laisser les alias de routes actifs pour éviter les liens cassés ;
- corriger ou compléter les données par une migration additive, sans supprimer
  les événements déjà enregistrés.

La suppression des champs legacy, la bascule définitive des anciennes
permissions et l'abandon des alias feront l'objet d'un changement ultérieur
après validation en production.

## Open Questions restantes

Les décisions V1 de période KPI, actions ouvertes, réassignation, création
manuelle, session d’extension, rapprochement inter-plateforme, catalogues,
appels historiques et fuseau horaire sont figées dans
`docs/crm-architecture.md`. Les frontières de requête et de mutation sont
décrites dans `docs/crm-api-contract.md`.

Il reste uniquement deux sujets à traiter avant la mise en production :

- les sélecteurs et routes exactes de chaque version Instagram/LinkedIn seront
  maintenus dans les adaptateurs sans modifier le contrat de résolution ou de
  capture ;
- la durée de conservation chiffrée sera définie avec la politique légale
  applicable avant l’implémentation de l’archivage ou de la suppression ; elle
  ne change pas le modèle d’isolation ni le flux CRM décrit ici.
