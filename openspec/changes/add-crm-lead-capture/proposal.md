## Why

Les setters disposent aujourd’hui de plusieurs morceaux de suivi répartis entre
le pipeline, les appels, les relances et les ventes. Ils ne disposent pas d’une
vue unique pour savoir quel lead traiter, quelle action réaliser et comment la
prospection contribue aux KPI.

Cette évolution introduit un CRM optionnel, partagé à l’échelle de l’entreprise,
alimenté directement depuis Instagram puis LinkedIn par une extension Chrome
qui capture les informations visibles sans API Meta ou LinkedIn.

## What Changes

- Ajouter un module CRM activable ou désactivable par le owner de l’entreprise.
- Ajouter une entrée CRM de premier niveau après Dashboard.
- Regrouper sous CRM les vues Aujourd’hui, Pipeline, Leads, Actions et Appels.
- Conserver les anciennes URLs /ventes/pipeline et /ventes/appels comme alias ou
  redirections compatibles.
- Étendre le suivi des leads avec l’identité sociale, l’URL canonique, la
  plateforme, le responsable, les activités, les actions et les résultats.
- Limiter la reconnaissance d’un profil à l’entreprise courante.
- Permettre à tous les utilisateurs CRM de voir les leads de l’entreprise,
  modifier le statut et les champs simples.
- Réserver la réassignation, la structure du pipeline et la vue équipe aux
  permissions correspondantes, avec owner et manager par défaut.
- Ajouter les cinq étapes exactes du pipeline :
  1er message envoyé, Conversation en cours, Contenu de valeur envoyé,
  Appel proposé, Appel booké.
- Modéliser séparément les résultats No-show, Perdu, Vendu et Rouvrir.
- Généraliser le moteur d’actions pour séparer Prospection, Vente et
  Rendez-vous sans dupliquer les actions du Dashboard.
- Projeter les appels existants dans CRM sans créer un second système d’appels.
- Ajouter les KPI de prospection et de vente par setter et par équipe.
- Ajouter la capture Chrome des profils inconnus, connus et ambigus, avec un
  bouton flottant détecté sur les pages pertinentes.
- Garantir que le responsable est en lecture seule dans l’extension.
- Préparer la migration des anciens statuts, relances, commentaires et
  historiques vers le modèle cible.

## Capabilities

### New Capabilities

- crm-lead-management: leads sociaux tenant-scoped, pipeline, résultats,
  historique, notes partagées et responsabilité.
- crm-actions-and-calls: actions catégorisées, relances, vue Aujourd’hui,
  appels et raccordement aux sources existantes.
- crm-extension-capture: capture DOM Instagram/LinkedIn, résolution de profil,
  création ou mise à jour confirmée et états de correspondance.
- crm-module-access: activation owner-only, navigation conditionnelle et
  permissions CRM.
- crm-kpis: événements, attribution et calcul des KPI CRM par setter et équipe.

### Modified Capabilities

Aucune capacité OpenSpec existante ne décrit actuellement le comportement
fonctionnel du CRM ou des leads sociaux. Les capacités existantes d’appels,
réservations et ventes restent des sources de vérité et ne sont pas remplacées.

## Impact

- app/(app)/crm/ pour les nouvelles surfaces CRM.
- components/app-sidebar.tsx et lib/nav/pillar-subpages.ts pour la navigation.
- lib/team/permissions.ts et le contexte d’équipe pour les accès.
- lib/leads/ et db/schema.ts pour le modèle et l’historique.
- lib/dashboard/revenue-actions.ts pour le moteur d’actions partagé.
- lib/iclosed/, lib/calendly/, les appels, rendez-vous et ventes existants.
- Extension Chrome Manifest V3 et endpoints authentifiés de résolution/capture.
- Migrations Drizzle, politiques RLS, tests d’isolation et tests d’idempotence.
- Catalogues i18n FR/EN pour tous les libellés du nouveau module.
