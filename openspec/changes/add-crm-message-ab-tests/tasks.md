## 1. Fiabiliser l’identité des profils capturés

- [x] 1.1 Reproduire le cas « Voir Profil » sur Instagram et LinkedIn, tracer la source DOM retenue par la capture et documenter les variantes de pages concernées.
- [x] 1.2 Corriger l’extraction pour privilégier la zone d’identité, rejeter les libellés génériques et préremplir un handle modifiable lorsqu’aucun nom fiable n’est visible.
- [x] 1.3 Ajouter des tests de régression Instagram/LinkedIn pour le nom visible, « Voir Profil », l’absence de nom et la correction manuelle avant création.

## 2. Persister les tests et les attributions

- [x] 2.1 Ajouter au schéma Drizzle les tests, leurs variantes texte et les attributions figées avec les contraintes d’unicité et de cycle de vie définies dans `design.md`.
- [x] 2.2 Créer la migration Drizzle additive, vérifier les politiques RLS tenant-scoped, puis appliquer la migration avec le workflow du projet.
- [x] 2.3 Implémenter les opérations métier de création, activation, pause, reprise et fin, avec un seul test actif par compte et canal.
- [x] 2.4 Attribuer côté serveur une variante 50/50 et son instantané de texte au moment de la création d’un nouveau lead, dans un flux idempotent et cohérent avec la capture existante.
- [x] 2.5 Ajouter les tests de stabilité d’attribution, de double capture, de conflits de tests actifs et de cloisonnement entre comptes.

## 3. Comptabiliser les copies et calculer les résultats

- [x] 3.1 Ajouter une route idempotente qui enregistre la date et l’auteur de la copie sans modifier le statut ou l’étape du lead.
- [x] 3.2 Empêcher les copies non comptabilisées après la fin d’un test, tout en conservant l’attribution et son contenu historique.
- [x] 3.3 Calculer par variante les attributions, messages comptabilisés, fenêtres terminées, réponses sous 168 heures, leads encore en observation et rendez-vous séparés.
- [x] 3.4 Afficher l’avertissement de volume insuffisant sous 50 fenêtres terminées par variante sans calcul automatique de gagnant.
- [x] 3.5 Ajouter des tests de calcul aux bornes de la fenêtre, de réponses tardives, d’événements répétés, de maturité après la fin et de rendez-vous secondaires.

## 4. Sécuriser et exposer les opérations CRM

- [x] 4.1 Ajouter la permission `crm:manage-message-tests` selon les conventions de rôles CRM, tout en laissant la consultation suivre `crm:view`.
- [x] 4.2 Ajouter ou étendre les routes authentifiées pour lister, créer, consulter, gérer le cycle de vie et enregistrer une copie ; valider les entrées avec Zod et dériver compte, test et variante côté serveur. Conserver l’ancienne route de confirmation pour compatibilité.
- [x] 4.3 Vérifier que toutes les lectures et mutations appliquent les contrôles de session, permission et tenant, y compris pour un identifiant de test appartenant à un autre compte.
- [x] 4.4 Ajouter les tests d’accès lecture/gestion, d’isolation RLS, de rejeu de requête et de conflit de reprise.

## 5. Construire les vues CRM des tests

- [x] 5.1 Ajouter l’entrée Tests à la navigation CRM et la liste Actifs / En pause / Terminés, avec tableau desktop, cartes mobile et états vides.
- [x] 5.2 Construire le formulaire de création avec canal, nom, deux variantes texte, compteur, aperçu, répartition fixe, fenêtre de sept jours et confirmation avant activation.
- [x] 5.3 Construire le détail comparatif A/B avec nombres et dénominateurs visibles, observations en cours, rendez-vous secondaires, aperçu des messages et avertissement de volume.
- [x] 5.4 Ajouter les dialogues de confirmation de pause et de fin ainsi que la reprise directe et le rendu « collecte en cours » après la fin.
- [x] 5.5 Ajouter toutes les clés de traduction synchronisées FR/EN, vérifier l’accessibilité des dialogues et des statuts et appliquer les tokens du design system.

## 6. Intégrer les variantes dans l’extension Chrome

- [x] 6.1 Afficher la variante et son texte conservé sur une nouvelle fiche, puis comptabiliser la copie automatiquement après le succès du presse-papiers.
- [x] 6.2 Retirer l’action « Je l’ai envoyé » et permettre de réessayer la copie si son enregistrement échoue.
- [x] 6.3 Implémenter les états déjà contacté, test en pause, test terminé (historique en lecture seule si la copie n’est pas comptabilisée), aucun test actif, identité à confirmer et erreur réseau selon les décisions du change.
- [x] 6.4 Vérifier que la capture existante et les anciennes versions de l’extension restent compatibles, et que le client ne peut pas choisir ou changer la variante.
- [x] 6.5 Ajouter les tests d’extension pour la copie, son comptage idempotent, les tests indisponibles et les erreurs réseau.

## 7. Vérifier les surfaces et la livraison

- [x] 7.1 Exécuter `npm run typecheck`, `npm run lint` et `npm run test`, y compris les vérifications des catalogues FR/EN.
- [x] 7.2 Lancer l’application avec Turbopack et vérifier `/crm/tests` en bureau et mobile avec `agent-browser`, y compris dialogues, états vides, erreurs et texte visible.
- [x] 7.3 Vérifier le panneau d’extension sur les états de capture et les transitions SPA ; confirmer qu’aucune chaîne de clé i18n brute ou libellé générique de profil n’apparaît.
- [x] 7.4 Vérifier le diff pour les secrets, confirmer que la migration Drizzle est générée et appliquée et que le build de prévisualisation passe.

## 8. Actualiser l’extension lors d’une navigation SPA

- [x] 8.1 Reproduire le changement de profil ou de conversation sans rechargement, y compris lorsque le DOM arrive après l’URL.
- [x] 8.2 Réinitialiser la résolution de l’ancien profil et relancer automatiquement la détection pour l’identité active.
- [x] 8.3 Ajouter une régression qui vérifie le changement de profil et le remplacement du lien CRM sans rafraîchissement.
