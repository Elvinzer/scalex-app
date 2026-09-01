# Plan d’implémentation

Statut : V1 implémentée, testée et contrôlée localement le 1 septembre 2026.
Les points de déploiement progressif restent des opérations post-pilote ; ils
ne bloquent pas la livraison du rapprochement assisté.

## 1. Contrats et état existant

- [x] 1.1 Inventorier les champs déjà disponibles dans `sales_calls`, les identifiants iClosed/Calendly et les champs actuellement projetés dans Appels.
- [x] 1.2 Définir le contrat de vue appel, les libellés desktop/mobile et les fixtures d’acceptation, notamment le remplacement de « Créé le » par « Date/heure de l’appel ».
- [x] 1.3 Définir les états de suggestion, les niveaux de confiance, les codes de raison et les champs minimaux transmis à Falco.

## 2. Modèle de données et migration

- [x] 2.1 Ajouter le modèle parent des suggestions de rapprochement avec son cycle de vie, son empreinte d’entrée, son horodatage, sa version de modèle et ses métadonnées d’audit.
- [x] 2.2 Ajouter les candidats classés d’une suggestion avec leur score de revue, leurs preuves et leurs raisons sans dupliquer la source de vérité des leads ou des appels.
- [x] 2.3 Ajouter la référence optionnelle vers la suggestion acceptée dans le chemin `crm_call_links` ou dans l’événement d’audit équivalent.
- [x] 2.4 Ajouter les index, policies RLS, contraintes d’unicité et migration additive nécessaires à l’isolation par compte.
- [x] 2.5 Définir et tester la rétention des snapshots de suggestion et des données de contact afin de limiter la conservation de PII.

## 3. Résolution déterministe des candidats

- [x] 3.1 Implémenter la normalisation commune des noms, accents, ponctuation, handles, identifiants de profil, téléphones et dates.
- [x] 3.2 Construire une shortlist account-scoped de cinq leads maximum avec les signaux disponibles : identifiants exacts, identité normalisée, proximité temporelle, plateforme, setter, closer et type d’événement.
- [x] 3.3 Empêcher qu’un nom seul produise une correspondance forte et expliciter les preuves manquantes pour les cas faibles ou ambigus.
- [x] 3.4 Revalider l’empreinte, l’absence de lien existant et l’appartenance au compte avant chaque génération ou affichage exploitable.
- [x] 3.5 Couvrir par des tests les noms communs, l’absence de candidat, les candidats multiples, les identifiants exacts et l’isolation inter-comptes.

## 4. Contrat Falco et appel agent

- [x] 4.1 Définir et valider avec Zod les contrats de requête/réponse : état, confiance, candidats classés, raisons, preuves manquantes, timestamp, modèle et empreinte.
- [x] 4.2 Appeler Falco via la clé BYOK/shared-key existante, le quota centralisé et la journalisation des tokens, sans exposer ni logger de PII brute inutile.
- [x] 4.3 Mapper proprement les réponses invalides, timeouts, indisponibilités et erreurs de quota vers des états réessayables ou une reprise manuelle.
- [x] 4.4 Tester les fixtures valide, ambiguë, sans correspondance, indisponible, invalide et rejouée de façon idempotente.

## 5. Orchestration asynchrone

- [x] 5.1 Déclencher la génération pour les nouveaux appels non reliés sans doublon, avec une clé d’idempotence par appel et empreinte d’entrée.
- [x] 5.2 Implémenter le job Inngest de génération avec cache, expiration, retry borné, séquencement par compte et absence d’appel Falco au rendu de page.
- [x] 5.3 Ajouter une analyse historique autorisée et bornée à 25 appels, avec retour du nombre mis en file et reprise par retry Inngest.
- [x] 5.4 Instrumenter les métriques de génération, no-match, acceptation, rejet, ignorance, expiration, latence et tokens consommés.

## 6. Lecture et recherche des appels

- [x] 6.1 Étendre la vue appel avec nom de l’invité, email/téléphone disponibles, source, type d’événement, date/heure, durée, référence fournisseur, identifiant interne et attribution.
- [x] 6.2 Ajouter la recherche account-scoped par identité, contact, source, référence, type d’événement et lead lié.
- [x] 6.3 Ajouter les filtres appels non reliés, source, période, présence, résultat et état de suggestion.
- [x] 6.4 Définir la lecture du détail directement dans la ligne/carte, avec référence fournisseur complète copiable, contexte d’appel, lien actuel et état de suggestion sans fuite inter-compte.
- [x] 6.5 Formaliser les contrats de Server Actions et leurs codes d’erreur pour la lecture, la recherche et le rapprochement.

## 7. Interface Appels

- [x] 7.1 Recomposer le tableau desktop pour séparer visuellement l’identité de l’appel et l’identité du lead, tout en gardant le statut « Appel non relié » explicite.
- [x] 7.2 Afficher une identité exploitable dans chaque ligne : invité, référence/source, date/heure et éléments disponibles, sans inventer de valeur manquante.
- [x] 7.3 Recomposer les cartes mobile avec les mêmes éléments d’identification et une hiérarchie lisible avant les actions de rapprochement.
- [x] 7.4 Afficher la suggestion Falco dans un panneau violet dédié avec lead proposé, niveau de revue, raisons, alternatives et preuves manquantes.
- [x] 7.5 Ajouter les actions explicites « Relier à ce lead », « Voir la fiche », « Ce n’est pas le bon lead » et « Choisir un lead », sans liaison automatique.
- [x] 7.6 Traiter les états chargement, aucun match, ambigu, indisponible, expiré, déjà relié et erreur, avec fallback manuel et accessibilité clavier/lecteur d’écran.

## 8. Confirmation, audit et permissions

- [x] 8.1 Implémenter la confirmation, le rejet et l’ignorance avec revalidation transactionnelle, idempotence et refus d’écraser un lien concurrent.
- [x] 8.2 Enregistrer la méthode de décision, la suggestion, la confiance, l’acteur, l’horodatage et la version/empreinte dans l’audit existant.
- [x] 8.3 Tester les permissions de lecture, de confirmation, de gestion d’équipe et l’interdiction d’accès à un autre compte.
- [x] 8.4 Vérifier qu’un rapprochement ne modifie pas silencieusement les champs du lead, le résultat de l’appel, la source canonique ou n’envoie de message social.

## 9. Activation progressive et retour arrière

- [x] 9.1 Réutiliser le feature flag account-level `crmEnabled` pour protéger la surface et les actions de rapprochement.
- [x] 9.2 Préparer le pilote sur les nouveaux appels d’un compte, puis sur un batch historique borné.
- [ ] 9.3 Comparer précision utile, acceptations, rejets, ignorances, no-match, rapprochements manuels, latence et coût tokens avant décision d’élargissement. (Post-pilote.)
- [x] 9.4 Documenter le rollback : désactiver génération et décision assistée en conservant appels canoniques, liens existants et audit.

## 10. Validation et documentation finale

- [x] 10.1 Ajouter les tests unitaires et d’intégration des projections, filtres, shortlist, contrat Falco, jobs, confirmation et RLS.
- [x] 10.2 Ajouter les contrôles runtime desktop, mobile, recherche, états de suggestion et fallback manuel.
- [x] 10.3 Mettre à jour la documentation API, l’architecture CRM, les règles de source de vérité et le runbook de rapprochement.
- [x] 10.4 Exécuter typecheck, lint, tests, validation OpenSpec, build et contrôles de secrets avant toute mise en production.
