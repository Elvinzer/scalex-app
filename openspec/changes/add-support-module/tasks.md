## 1. Accès interne et organisation des routes

- [x] 1.1 Définir les rôles internes `support_agent` et `support_manager`, la permission `support:tickets` et les règles de bypass fondateur hors de `lib/team/permissions.ts`.
- [x] 1.2 Ajouter le contexte serveur des membres internes, avec statuts actif/invité/suspendu et contrôle indépendant par page et Server Action.
- [x] 1.3 Adapter le layout Admin pour autoriser un staff interne puis conserver des gates spécifiques pour les pages fondateurs existantes.
- [x] 1.4 Ajouter la navigation interne Admin avec l'entrée Support, sans l'ajouter à la navigation métier client.

## 2. Schéma, stockage et sécurité des tickets

- [x] 2.1 Ajouter dans `db/schema.ts` les tables `staff_members`, `support_tickets`, `support_ticket_messages`, `support_ticket_events` et `support_ticket_attachments`.
- [x] 2.2 Ajouter les index nécessaires pour les files par statut, priorité, assignation, compte, demandeur et activité récente.
- [x] 2.3 Définir les politiques RLS pour séparer lecture publique autorisée, notes internes et accès staff.
- [x] 2.4 Ajouter le bucket privé de captures, ses politiques et une rétention bornée sans exposer de chemin contrôlé par l'utilisateur.
- [x] 2.5 Générer puis appliquer la migration Drizzle additive ; vérifier le SQL et les politiques avant toute utilisation.

## 3. Parcours utilisateur et contexte automatique

- [x] 3.1 Ajouter l'entrée localisée `Aide & support` dans le menu de compte et un point d'accès cohérent sur mobile.
- [x] 3.2 Construire le formulaire de création avec type, titre, description et champs conditionnels bug/évolution.
- [x] 3.3 Réutiliser le contexte de page existant et capturer la route la plus récente avec suppression des query params sensibles.
- [x] 3.4 Ajouter la génération de capture DOM, la prévisualisation, le retrait, les éléments exclus et le comportement de repli sans capture.
- [x] 3.5 Ajouter l'envoi multipart authentifié avec clé d'idempotence et affichage de la référence créée.
- [x] 3.6 Construire `/support` avec liste des tickets autorisés, détail public, messages et ajout de contexte.
- [x] 3.7 Ajouter les clés FR/EN dans les namespaces concernés et vérifier la synchronisation stricte des catalogues.

## 4. API et cycle de vie métier

- [x] 4.1 Ajouter les schémas Zod pour la création, les messages, les transitions, les filtres, les pièces jointes et les clés d'idempotence.
- [x] 4.2 Implémenter la route de création avec session serveur, résolution du compte, rate limiting, transaction ticket/attachement et réponse sans secret.
- [x] 4.3 Implémenter les mutations staff pour statut, priorité, assignation, doublon, message public, note interne et retry de notification.
- [x] 4.4 Implémenter l'historique append-only et les transitions automatiques lors d'une réponse utilisateur.
- [x] 4.5 Vérifier que les demandes répétées avec la même clé renvoient le ticket existant sans doublon.

## 5. Notifications Discord

- [x] 5.1 Ajouter la variable server-only du webhook Discord dans `.env.example` sans jamais y placer de valeur réelle.
- [x] 5.2 Construire le payload embed avec référence, identité, compte, page, contenu, contexte, lien Admin et mentions neutralisées.
- [x] 5.3 Envoyer la notification après insertion du ticket avec timeout, état `sent`, identifiant de message et absence de blocage en cas d'échec.
- [x] 5.4 Ajouter l'alerte liée aux nouvelles réponses publiques sans transmettre les notes internes.
- [x] 5.5 Ajouter la nouvelle tentative Admin et les états `pending`, `sent` et `failed` avec erreurs non sensibles.
- [x] 5.6 Vérifier qu'aucune URL de webhook, clé ou donnée sensible ne figure dans les logs, le frontend, les tests ou le diff.

## 6. Console Admin Support

- [x] 6.1 Construire `/admin/support` avec recherche, filtres URL, compteurs de statuts, état vide et affichage responsive.
- [x] 6.2 Construire `/admin/support/[ticketId]` avec contenu, contexte, capture privée, historique, messages publics et notes internes.
- [x] 6.3 Ajouter les contrôles de statut, priorité, assignation, doublon et fermeture avec feedback d'action.
- [x] 6.4 Afficher distinctement les statuts publics et internes avec les tokens Minaly et les variantes de bouton prévues.
- [x] 6.5 Ajouter l'identité et le rôle de l'agent ayant réalisé chaque changement dans la timeline.
- [x] 6.6 Vérifier que les agents support ne peuvent pas ouvrir les surfaces Admin fondateurs ou les données sensibles.

## 7. Vérification et livraison

- [x] 7.1 Ajouter les tests unitaires des permissions staff, transitions, visibilité des messages, idempotence et nettoyage du contexte.
- [x] 7.2 Ajouter les tests de payload Discord, mentions neutralisées, timeout, retry et absence de secrets.
- [x] 7.3 Ajouter les tests de migration/RLS et vérifier les scénarios propriétaire, membre d'équipe, fondateur, agent support et utilisateur non authentifié.
- [x] 7.4 Vérifier en runtime l'ouverture du formulaire, la capture, le retrait, la soumission, la page `/support`, la file Admin et les transitions publiques/internes.
- [x] 7.5 Exécuter les catalogues i18n, `npm run typecheck`, `npm run lint` et `npm run test`.
- [x] 7.6 Vérifier le build de preview, la configuration server-only du webhook et l'absence de secrets dans le diff final.
