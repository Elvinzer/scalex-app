## Context

Voir `proposal.md` pour la motivation et `specs/crm-mobile-setter-workflow/spec.md`
pour le contrat comportemental. Le CRM possède déjà un modèle canonique de
leads, d’événements, d’historique d’étapes, d’actions et de projections d’appels.
Le booking natif et les ventes ont leurs propres sources de vérité. La surface
mobile actuelle est composée de pages serveur, de drawers et de server actions,
avec une couverture Vitest mais sans harnais Playwright identifié dans le
package.json.

Les changes CRM existants ont choisi cinq étapes opérationnelles et des
résultats séparés. Ils ont aussi introduit des clés d’idempotence sur certaines
mutations, mais pas encore de façon homogène sur toutes les actions mobiles.
La capture actuelle suppose trop de données, présente `first_message_sent` par
défaut et place les notes/actions loin dans la fiche. Le booking existe comme
source canonique, mais n’est pas déclenchable depuis le contexte d’un lead CRM.

## Goals / Non-Goals

**Goals:**

- Construire une boucle mobile courte : file du jour → fiche → action →
  confirmation → lead suivant.
- Réduire la répétition inutile et rendre mesurable la charge cumulée sur 250
  boucles de setter.
- Conserver les événements CRM et les appels/ventes canoniques comme preuves,
  avec attribution et timestamps explicites.
- Ajouter la qualification libre et la réponse explicite sans transformer les
  notes en pseudo-données analytiques.
- Rendre les mutations récupérables dans les conditions normales d’un téléphone
  : double-tap, timeout, retour arrière et réseau interrompu.
- Corriger la géométrie mobile, les safe areas, le clavier, les focus et les
  états localisés sur les viewports définis dans la spec.

**Non-Goals:**

- Refaire l’expérience desktop ou le design global de Minaly.
- Remplacer le booking natif, iClosed, Calendly ou les ventes canoniques par une
  nouvelle source de données.
- Construire une synchronisation offline complète ou une application native.
  La première version garantit la conservation du brouillon et un retry sûr ;
  elle ne promet pas de valider une mutation sans serveur.
- Faire qualifier automatiquement un lead par un LLM ou déduire une réponse à
  partir d’un texte libre.
- Ajouter Kajabi, Brevo ou une nouvelle intégration commerciale.

## Decisions

### 1. Une file de travail personnelle, distincte du dashboard

`/crm` devient la projection opérationnelle des actions ouvertes du setter,
avec une vue due aujourd’hui et une vue en retard accessibles directement. La
page conserve les paramètres de filtre dans l’URL afin que l’ouverture d’une
fiche et le retour arrière ne réinitialisent pas la session de travail.

Alternative écartée : renvoyer le setter vers la liste globale des leads et lui
faire reconstruire sa file par recherche. C’est acceptable lors d’un test isolé,
mais cela impose plusieurs gestes à chaque lead et augmente le risque d’oubli.

### 2. Pré-contact séparé des cinq étapes de funnel

Les cinq étapes opérationnelles existantes restent la base des conversions afin
de ne pas casser les cohortes déjà définies. On ajoute un état de contact
explicite, initialement `new` puis `contacted`, qui permet d’afficher « Nouveau
lead » avant le premier message. Tant que cet état est `new`, aucun événement
`first_message_sent` ne peut être fabriqué par la capture. Le passage à
`contacted` est déclenché uniquement par l’action ou la source qui représente
réellement l’envoi du message.

Les données historiques sont backfillées à partir des événements existants : un
lead qui possède déjà un premier-message fiable est `contacted`; les autres
restent `new` sans inventer de date.

Alternative écartée : ajouter directement « Nouveau lead » dans l’enum des cinq
étapes. Cela simplifierait le libellé UI, mais modifierait les dénominateurs KPI
et contredirait la migration CRM qui sépare déjà le statut legacy du funnel
canonique.

### 3. Qualification libre, sans faux KPI

La V1 conserve une seule zone de texte libre par lead pour toute la
qualification. Elle est éditable depuis la fiche, sauvegardable progressivement
et journalisée comme activité, sans colonnes métier ni table dédiée. Tant qu’un
statut contrôlé n’existe pas, le produit ne déduit pas un taux de qualification
du contenu de la note ; il affiche ce KPI comme indisponible ou incomplet.

Alternative écartée : imposer dès maintenant huit champs structurés. Cela
augmenterait le temps de saisie sur téléphone et figerait un vocabulaire métier
qui n’est pas encore validé.

### 4. Deux parcours de booking, dont un strictement interne

La fiche propose deux actions distinctes. Le parcours « envoyer le lien » ouvre
le lien configuré et écrit une activité de lien envoyé ; il ne modifie pas
automatiquement le statut. Le setter confirme ensuite manuellement le booking
quand le prospect lui indique avoir réservé.

Le parcours « réserver pour le prospect » ouvre un formulaire Minaly interne,
prérempli avec le lead. Minaly calcule les créneaux disponibles pour le ou les
closers associés, permet au setter de choisir le créneau et le closer quand
plusieurs sont éligibles, puis confirme l’appointment interne. Il ne déclenche
ni iClosed, ni Calendly, ni une autre intégration externe. Il utilise une clé
d’idempotence et affiche l’état autoritatif de l’appointment interne après
sauvegarde.

Alternative écartée : un unique bouton « Book » qui mélangerait partage de lien
et réservation faite par le setter. Les deux actions n’ont ni le même effet,
ni le même moment de passage à « Appel booké », ni le même KPI.

### 5. Barre d’actions mobile compacte, sans drag-and-drop obligatoire

Sur téléphone, la fiche expose un résumé fixe ou une action sheet ancrée autour
des commandes fréquentes. Elle réserve explicitement l’espace de la navigation
inférieure, du home indicator et du bouton assistant. Le pipeline conserve une
alternative de changement d’étape par select ou action sheet ; le drag-and-drop
reste une amélioration desktop et ne devient jamais la seule façon d’avancer.

Alternative écartée : conserver les commandes après la timeline et demander un
long scroll à chaque note ou relance. Le coût de ce scroll est faible une fois,
mais devient dominant après plusieurs dizaines de leads.

### 6. Contrat commun pour les mutations mobiles

Chaque action mobile utilise le même contrat serveur : validation Zod à la
frontière, autorisation côté serveur, clé d’idempotence, transaction lorsque la
mutation touche plusieurs tables, retour discriminé `saved`, `pending` ou
`error`, et événement d’audit quand l’opération est durable. Les composants
désactivent le contrôle pendant la soumission et réconcilient leur état avec la
réponse serveur.

Les brouillons de note, qualification et action seront conservés pendant la
navigation ou un refresh dans un espace de session séparé par compte et par
lead, puis supprimés après accusé de sauvegarde. Aucun brouillon ne sera
présenté comme enregistré. Le retry réutilise la même clé d’idempotence.

Alternative écartée : généraliser une UI optimiste sans statut pending. Elle
donne une sensation rapide, mais masque les timeouts et crée des doublons quand
le setter retape sur le bouton.

### 7. KPI déterministes et drill-downs spécifiques

Les KPI restent calculés en code à partir des événements CRM, des appels et des
ventes canoniques. La nouvelle qualification ajoute un dénominateur explicite
et les cards mobiles pointent vers une requête correspondant à la métrique
cliquée. Les conversions comptent des leads uniques ; les événements gardent
l’acteur et le responsable au moment du fait. Une donnée insuffisante produit
un état incomplet, jamais un zéro de convenance.

Alternative écartée : déduire réponse ou qualification de l’étape courante du
lead. Une étape ne conserve ni la date exacte ni l’acteur, et elle change après
réassignation ou réouverture.

### 8. QA par paliers, avec une boucle de répétition explicite

Les tests de domaine et de mutations restent dans Vitest. Une suite mobile
automatisée sera ajoutée seulement si l’audit de la dépendance est acceptable,
avec les appareils/presets iPhone disponibles et les sept largeurs imposées.
Dans tous les cas, une matrice manuelle ou automatisée doit exécuter 250
boucles, dont une partie avec latence et échec réseau, et mesurer le coût
cumulé. Toute dépendance de test supplémentaire exige `npm audit` avant
installation conformément aux conventions du dépôt.

## Risks / Trade-offs

- [Compatibilité avec les cohortes à cinq étapes] → conserver les cinq étapes,
  backfiller l’état de contact sans fabriquer d’événement, et ajouter des tests
  de cohorte avant migration.
- [Booking partiellement confirmé ou créneau pris] → confirmer le créneau dans
  le service canonique, rendre l’opération idempotente et proposer des
  alternatives avant de mettre à jour le lead.
- [Brouillon de données sensibles en session] → limiter les données au texte
  nécessaire, isoler par compte/lead, supprimer après accusé et ne jamais les
  logger ni les inclure dans une URL.
- [Migration Supabase partagée dev/prod] → migration Drizzle additive, policies
  RLS et index vérifiés, backfill séparé et rollback par désactivation des
  nouvelles surfaces plutôt que suppression de données.
- [Barre d’actions qui couvre la navigation ou Falco] → calculer les offsets à
  partir des safe areas, réserver un padding de contenu et tester le pire cas
  320 × 568 avec le clavier ouvert.
- [Pagination qui casse la continuité] → utiliser un curseur ou une pagination
  stable, préserver le tri et les paramètres dans l’URL, puis tester retour
  arrière et rafraîchissement.
- [Copy ou clés i18n incomplètes] → modifier `en` et `fr` ensemble, parser les
  JSON bruts, ouvrir les drawers/dialogues dans les tests et refuser toute clé
  brute visible.
- [Suite 250 boucles trop coûteuse] → générer un dataset déterministe, séparer
  les tests rapides des checkpoints réseau et conserver un rapport de temps par
  action plutôt qu’un screenshot géant.

## Migration Plan

1. Comparer ce change avec les contrats encore actifs de capture de leads,
   réconciliation des appels et booking ; résoudre les conflits de modèle avant
   de coder.
2. Ajouter de façon additive l’état pré-contact, les coordonnées nécessaires au
   booking, la représentation de la note de qualification libre, le booking
   interne et les métadonnées de perte si le modèle actuel ne les porte pas.
   Générer puis appliquer une migration Drizzle ; vérifier RLS, index et données
   existantes. Ne jamais utiliser `db push`.
3. Backfiller l’état de contact uniquement à partir de faits existants. Ne pas
   fabriquer de qualification structurée ni de taux de qualification à partir
   des anciennes notes ; produire une liste des données inconnues.
4. Mettre en place le contrat de mutation commun et les requêtes de file du
   jour/pagination avant de déplacer les actions dans la fiche mobile.
5. Livrer les surfaces capture, fiche, qualification, relance, résultat et
   booking derrière l’accès CRM existant, puis activer le parcours pour un
   compte pilote.
6. Ajouter les états localisés, la matrice mobile et les tests réseau. Exécuter
   la simulation de cinq jours et corriger d’abord les coûts cumulés les plus
   élevés.
7. Si le pilote est stable, généraliser l’entrée mobile et surveiller les
   doublons, brouillons non envoyés, temps par lead et écarts de KPI.

Le rollback fonctionnel consiste à masquer la nouvelle file et la barre
mobile, puis à conserver les pages CRM existantes. Les migrations sont
additives ; aucune donnée de qualification ou d’événement ne doit être effacée
pour revenir à l’ancienne surface.
