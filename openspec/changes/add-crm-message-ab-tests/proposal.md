## Why

Les équipes CRM n’ont pas de moyen simple de comparer les premiers messages envoyés depuis Instagram ou LinkedIn. Les variantes sont copiées depuis des documents externes, leur attribution aux leads n’est pas conservée et les réponses ne peuvent pas être comparées de façon fiable.

Cette évolution ajoute la gestion des tests de premiers messages au CRM et à l’extension Chrome. Elle couvre également un problème de qualité de capture signalé dans l’extension : certains profils sont enregistrés avec un libellé d’interface comme « Voir Profil » au lieu de leur nom ou identifiant réel.

## What Changes

- Ajouter au CRM une liste des tests avec les états actif, en pause et terminé, ainsi que leurs actions de gestion.
- Permettre de créer un test par canal avec deux variantes de premier message, une répartition automatique cible de 50/50 et une fenêtre d’observation de sept jours qui démarre à la copie du message.
- Attribuer et conserver une variante et son contenu figé pour chaque nouveau lead capturé pendant un test actif.
- Afficher dans l’extension la variante du lead et son aperçu, puis comptabiliser automatiquement sa copie sans demander de confirmation d’envoi.
- Mesurer le taux de réponse à sept jours à partir des messages copiés dont la fenêtre d’observation est terminée ; ne pas modifier l’état de contact du lead ni déclarer qu’un envoi a eu lieu.
- Permettre de mettre en pause, reprendre et terminer un test sans réattribuer les leads existants ni déclarer automatiquement un gagnant.
- Rendre le nom de profil capturé fiable : ignorer les libellés génériques d’interface, utiliser l’identifiant social comme valeur de secours modifiable et couvrir les cas Instagram et LinkedIn.
- Limiter la première version aux variantes texte. Préserver une structure permettant d’ajouter des variantes audio dans une évolution ultérieure.

## Capabilities

### New Capabilities

- `crm-message-ab-tests`: création et gestion des tests, attribution immuable des variantes, comptabilisation de la copie et mesure des réponses.
- `crm-extension-profile-name-reliability`: extraction et validation du nom ou identifiant de profil dans l’extension, avec une valeur de secours modifiable.

### Modified Capabilities

Aucune capacité CRM archivée dans `openspec/specs/` ne décrit actuellement ces comportements. Les exigences fonctionnelles correspondantes sont donc créées comme nouvelles capacités dans ce change.

## Impact

- Surfaces CRM sous `/crm`, avec liste, création et détail des tests, gestion de leur cycle de vie et résultats.
- Extension Chrome : capture de profil, affichage et copie de la variante, enregistrement automatique de la copie, reprise de la navigation SPA et états d’erreur.
- Modèle de données CRM et migrations Drizzle pour les tests, variantes, attributions et événements nécessaires aux résultats, avec politiques RLS tenant-scoped.
- Routes/API de l’extension et du CRM pour l’attribution, la lecture et l’enregistrement idempotent des copies, protégées par la session et les permissions CRM.
- Calculs KPI CRM, en séparant taux de réponse principal et rendez-vous réservés secondaire.
- Permissions d’équipe et catalogues i18n français et anglais.
- Tests de domaine, d’accès tenant, d’idempotence, de calcul des fenêtres et de capture des noms de profil.
- Aucune dépendance externe ou intégration d’envoi de message n’est ajoutée ; l’extension ne transmet pas elle-même le message au réseau social.
