## Validation de la checklist

La V1 a été implémentée et contrôlée localement le 1 septembre 2026. Les
preuves comprennent les tests Vitest, le typecheck, le lint, le build Vercel,
le build de l’extension, la validation OpenSpec et les smoke tests runtime
Next.js. La tâche 9.7 reste une étape opérationnelle de pilote post-déploiement
et ne doit pas être simulée sur la base partagée sans compte pilote validé.

## 1. Contracts et fondations

- [x] 1.1 Relire la documentation Next.js présente dans node_modules avant toute modification de code et figer les conventions App Router retenues pour le module CRM.
- [x] 1.2 Transformer les codes métier du design en contrats stables : cinq étapes CRM, résultats séparés, catégories d’actions, sources d’événements et états d’extension.
- [x] 1.3 Cartographier les champs legacy des leads, relances, commentaires, appels et permissions vers les contrats CRM sans supprimer de données existantes.
- [x] 1.4 Définir les schémas Zod partagés des commandes de résolution, capture, mise à jour, changement d’étape, résultat, note, action, réassignation et lien d’appel.

## 2. Modèle de données et sécurité de persistance

- [x] 2.1 Étendre le modèle lead de façon additive avec accountId, identité sociale normalisée, plateforme, URL canonique, qualification, responsable courant, étape CRM, résultat et dates sociales distinctes.
- [x] 2.2 Ajouter les événements append-only, l’historique d’étape, l’historique de responsabilité et les notes d’équipe avec actorUserId, source, accountId et timestamps.
- [x] 2.3 Ajouter le modèle canonique d’actions avec lead, catégorie, type, échéance, statut, priorité, responsable, créateur et informations de complétion.
- [x] 2.4 Ajouter l’association auditable entre un appel canonique et un lead, sans copier les statuts ou résultats de salesCalls.
- [x] 2.5 Ajouter l’état crmEnabled au niveau compte et les permissions CRM granulaires, ou documenter précisément leur réutilisation si une structure existante couvre déjà le besoin.
- [x] 2.6 Créer les contraintes d’unicité et index tenant-scoped pour accountId + platform + canonicalProfileUrl, les identifiants de source et les requêtes d’actions/KPI.
- [x] 2.7 Écrire les policies RLS de toutes les tables CRM et vérifier qu’elles n’exposent ni lead, événement, note, action ni lien d’appel d’un autre compte.
- [x] 2.8 Générer les migrations Drizzle additives et leur meta, puis vérifier le SQL avant toute application sur la base partagée.

## 3. Autorisation et services métier CRM

- [x] 3.1 Implémenter la résolution serveur du compte courant et du membre à partir de la session Supabase, sans accepter accountId depuis le client.
- [x] 3.2 Implémenter le garde CRM commun qui vérifie session, appartenance, crmEnabled et permission avant chaque lecture ou mutation.
- [x] 3.3 Implémenter le résolveur d’identité sociale : URL canonique exacte d’abord, handle comme signal secondaire, nom seul jamais comme correspondance automatique.
- [x] 3.4 Implémenter les commandes transactionnelles de création et de mise à jour d’un lead avec événement, historique et clé d’idempotence.
- [x] 3.5 Implémenter les changements d’étape, résultats, réouverture, no-show, notes d’équipe et réassignation en conservant l’acteur et le responsable séparément.
- [x] 3.6 Appliquer les règles de permission : champs simples et étape pour les utilisateurs CRM, réassignation/structure/vue équipe pour les droits dédiés, vente pour closer autorisé/manager/owner.
- [x] 3.7 Implémenter les réponses not-found ou unavailable qui ne révèlent jamais l’existence d’un lead hors compte ou d’un CRM désactivé.
- [x] 3.8 Rendre les écritures rejouables : idempotency key obligatoire pour les captures et sourceEventKey pour les événements sans double création ni double comptage.

## 4. Navigation, routes et activation du module

- [x] 4.1 Créer le layout CRM et les routes /crm, /crm/pipeline, /crm/leads, /crm/actions et /crm/appels avec contrôle d’accès serveur.
- [x] 4.2 Construire la vue CRM Aujourd’hui avec KPI de période, Mes actions par défaut, sections Prospection/Vente/Rendez-vous et groupes En retard/Aujourd’hui/À venir.
- [x] 4.3 Construire les vues Pipeline et Leads conformément aux cinq étapes et à la visibilité company-wide des leads.
- [x] 4.4 Construire les vues Actions et Appels à partir des services canoniques, sans créer de projection concurrente dans Ventes.
- [x] 4.5 Mettre à jour components/app-sidebar.tsx et lib/nav/pillar-subpages.ts pour placer CRM après Dashboard et appliquer la hiérarchie mobile prévue.
- [x] 4.6 Retirer Pipeline et Appels de la navigation concurrente de Ventes tout en conservant Suivi des ventes et Rendez-vous.
- [x] 4.7 Brancher /ventes/pipeline et /ventes/appels sur les mêmes surfaces CRM par redirection ou alias compatible, avec vérification des anciennes permissions.
- [x] 4.8 Ajouter le parcours d’activation owner-only dans onboarding et Paramètres > Modules > CRM, avec état Plus tard et confirmation de succès.
- [x] 4.9 Rendre la navigation et les mutations indisponibles lorsque CRM est désactivé, sans supprimer les données, et invalider les caches concernés après activation/désactivation.

## 5. Actions, relances et vue Aujourd’hui

- [x] 5.1 Généraliser lib/dashboard/revenue-actions.ts autour du modèle d’actions CRM et adapter le Dashboard sans deuxième écriture de relance.
- [x] 5.2 Implémenter les catégories Prospection, Vente et Rendez-vous ainsi que le filtre Relances comme type/propriété d’action.
- [x] 5.3 Implémenter la vue personnelle et la vue équipe avec contrôle crm:view-team, en conservant la visibilité company-wide des leads.
- [x] 5.4 Implémenter les filtres Actions par catégorie, Relances et En retard, avec échéance, responsable, statut et lien lead.
- [x] 5.5 Implémenter la règle de réassignation : les actions de prospection ouvertes suivent le nouveau responsable, les actions terminées restent historiquement attribuées.
- [x] 5.6 Créer le candidat d’action Rendez-vous après un no-show sans basculer automatiquement le lead en Perdu.

## 6. Appels, rendez-vous et ventes canoniques

- [x] 6.1 Exposer dans CRM Appels les appels iClosed, Calendly et manuels reliés de façon fiable avec leurs champs canoniques.
- [x] 6.2 Empêcher toute création de lead ou d’appel à partir d’une correspondance historique incertaine et rendre les appels non reliés visibles dans leur source.
- [x] 6.3 Relier les résultats honoré, no-show et vente aux événements CRM sans remplacer les sources salesCalls, rendez-vous ou sales.
- [x] 6.4 Vérifier la validation de vente par closer autorisé, manager et owner, sans fabriquer ni dupliquer l’enregistrement financier canonical.

## 7. KPI et attribution

- [x] 7.1 Implémenter les requêtes déterministes des événements CRM, historiques d’étape, appels canoniques et ventes canoniques, sans appel LLM.
- [x] 7.2 Implémenter les comptes opérationnels messages, réponses, conversations, contenus de valeur, appels proposés/bookés/honorés, no-shows et ventes validées.
- [x] 7.3 Implémenter la cohorte V1 des premiers messages dans la période sélectionnée, les milestones uniques et les taux avec dénominateur du milestone précédent.
- [x] 7.4 Implémenter les filtres période, setter, équipe, plateforme, offre et source lorsqu’ils existent, avec scope visible dans l’interface.
- [x] 7.5 Implémenter l’attribution distincte actorUserId, responsable au moment du milestone, responsable courant, closer et source financière.
- [x] 7.6 Vérifier que réouverture, réassignation et captures répétées ne changent pas artificiellement les conversions uniques.
- [x] 7.7 Afficher les données indisponibles/incomplètes et le contexte période/cohorte au lieu d’inventer une valeur.

## 8. Extension Chrome Manifest V3

- [x] 8.1 Créer la structure Manifest V3, content scripts, service worker et carte flottante avec permissions minimales.
- [x] 8.2 Implémenter l’échange d’authentification à usage unique vers une session d’extension courte, sans copier la session Supabase navigateur ni conserver de secret dans les logs.
- [x] 8.3 Isoler les sélecteurs Instagram et LinkedIn dans des adaptateurs qui ne lisent que le DOM visible et renvoient une capture partielle si un champ manque.
- [x] 8.4 Implémenter la détection de page pertinente et l’état bouton fermé, sans bouton sur une page non supportée.
- [x] 8.5 Implémenter le contrat resolve et les états unknown, known, ambiguous, unavailable et session expirée avec réponses validées.
- [x] 8.6 Implémenter la carte unknown avec URL, identité visible, champs prénom/nom facultatifs, offre, source, étape, responsable en lecture seule et dates correctement libellées.
- [x] 8.7 Implémenter la confirmation Ajouter au CRM, le succès avec lien vers la fiche et l’absence totale d’écriture lors d’une fermeture ou d’un abandon.
- [x] 8.8 Implémenter la carte known avec statut, responsable en lecture seule, prochaine action, note/action et mises à jour autorisées.
- [x] 8.9 Implémenter la carte ambiguous avec profil visité, candidat, confirmation de correspondance ou création séparée après décision explicite.
- [x] 8.10 Implémenter messageOccurredAt, capturedAt et createdAt sans afficher un createdAt effectif avant la création confirmée.
- [x] 8.11 Bloquer l’envoi, la modification et la programmation de messages sociaux depuis tous les états de l’extension.
- [x] 8.12 Tester retry réseau, double clic, session expirée, CRM désactivé, DOM partiel, absence de message et réponse serveur lente.

## 9. Migration et déploiement progressif

- [x] 9.1 Écrire le backfill accountId et produire un rapport des leads existants sans identité sociale ou URL canonique fiable.
- [x] 9.2 Mapper les statuts legacy vers les cinq codes CRM en conservant la valeur historique et les événements associés.
- [x] 9.3 Mapper les leads close, perdu, no-show et rdv_honore vers les résultats CRM sans effacer leur étape historique.
- [x] 9.4 Convertir les relances et commentaires existants avec sourceId, auteur, timestamps et idempotence préservés.
- [x] 9.5 Créer uniquement les liens d’appels historiques dont l’identité est fiable et documenter le volume restant non relié.
- [x] 9.6 Déployer les migrations avec crmEnabled désactivé par défaut, valider les comptes résolus et préparer le rollback par flag.
- [ ] 9.7 Activer un compte pilote, comparer anciennes et nouvelles projections, vérifier les KPI et seulement ensuite élargir l’activation.
- [x] 9.8 Documenter la procédure de rollback et reporter la suppression des champs legacy, permissions et alias à un changement post-validation.

## 10. UI, i18n et accessibilité

- [x] 10.1 Ajouter toutes les clés de wording CRM dans les catalogues FR et EN avec structure strictement miroir et placeholders identiques.
- [x] 10.2 Reproduire les surfaces desktop/mobile du handoff pour Aujourd’hui, Pipeline, Leads, Actions, Appels, fiche lead, extension et états du cycle de vie.
- [x] 10.3 Vérifier qu’un seul CTA prioritaire corail est utilisé par écran et que les actions répétées restent en outline selon la DA existante.
- [x] 10.4 Vérifier les états vide, chargement, erreur, succès, désactivé, ambigu, session expirée et capture partielle avec texte utile et non ambigu.
- [x] 10.5 Vérifier clavier, focus, contraste, lecteurs d’écran, tableaux responsives, cartes mobiles et absence de débordement de la carte extension.

## 11. Vérification et qualité

- [x] 11.1 Ajouter les tests unitaires des transitions d’étape, résultats, réouverture, réassignation, actions et normalisation d’URL.
- [x] 11.2 Ajouter les tests d’isolation RLS et d’autorisation serveur pour chaque rôle, compte, route legacy et endpoint extension.
- [x] 11.3 Ajouter les tests d’idempotence de création, capture répétée, retries d’action, événements et liens d’appels.
- [x] 11.4 Ajouter les fixtures KPI pour cohorte, période, réouverture, changement de setter, no-show, vente et données incomplètes.
- [x] 11.5 Ajouter les tests des adaptateurs DOM Instagram/LinkedIn et des états de l’extension sans utiliser d’API sociale.
- [x] 11.6 Exécuter les tests runtime des parcours UI en ouvrant menus, filtres, états, vue équipe, activation et cartes extension.
- [x] 11.7 Vérifier les catalogues FR/EN bruts, doublons JSON et clés réellement utilisées par les composants.
- [x] 11.8 Lancer typecheck, lint, tests complets, audit des nouvelles dépendances et build Vercel avant toute déclaration de fin.
