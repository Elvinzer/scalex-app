## 1. Modèle de données et migration

- [x] 1.1 Ajouter les types et colonnes `stripe_transactions` pour les charges account-scoped, avec montant en unités mineures, devise, customer, facture, abonnement, statut et fraîcheur.
- [x] 1.2 Ajouter `stripe_transaction_refunds` pour les remboursements totaux ou partiels, avec identifiant unique et rattachement à la charge.
- [x] 1.3 Ajouter `stripe_insight_runs` pour l'historique des formulations IA, le snapshot, les signaux et la consommation BYOK/shared.
- [x] 1.4 Ajouter l'état de dernière synchronisation à `stripe_connections` sans exposer le token OAuth.
- [x] 1.5 Ajouter les index, contraintes d'unicité, policies RLS et vérifier le cloisonnement par compte.
- [x] 1.6 Générer la migration Drizzle avec `npm run db:generate`, la relire et l'appliquer avec `npm run db:migrate`.

## 2. Projection et synchronisation Stripe

- [x] 2.1 Créer les types de projection Stripe et les normalisateurs sans stocker de données de carte ni de secret.
- [x] 2.2 Implémenter l'upsert idempotent des charges et des remboursements par compte Connect et identifiant Stripe.
- [x] 2.3 Classer les charges réussies, échouées, remboursées et récurrentes avec les informations facultatives disponibles.
- [x] 2.4 Étendre le job Inngest existant à la projection transactionnelle tout en conservant la réconciliation `sales` et les agrégats mensuels.
- [x] 2.5 Ajouter l'événement de synchronisation demandée et le cron de rafraîchissement account-scoped.
- [x] 2.6 Mettre à jour l'état `pending/completed/failed`, la fraîcheur et le message d'erreur non sensible à chaque run.
- [x] 2.7 Ajouter la Server Action de rafraîchissement avec session, permission, validation Zod, rate limit et revalidation de la page.
- [x] 2.8 Ajouter les tests unitaires de normalisation, d'idempotence, de remboursement partiel, de devise et d'erreur récupérable.

## 3. Snapshot analytique et signaux déterministes

- [x] 3.1 Créer le type de snapshot versionné et le filtre de période/devise indépendant de la base.
- [x] 3.2 Calculer CA brut, remboursements, CA net, transactions, échecs, montant à risque, récurrence, clients uniques/récurrents et ticket moyen.
- [x] 3.3 Calculer les comparaisons avec la période précédente sans division par zéro ni conversion inter-devises.
- [x] 3.4 Produire les signaux de tendance, remboursements, échecs, récurrence, fidélité et concentration avec seuils et garde d'échantillon.
- [x] 3.5 Ajouter les tests de calcul, périodes vides, devises multiples, échantillons insuffisants et données extrêmes.

## 4. Reformulation IA optionnelle

- [x] 4.1 Ajouter le générateur de texte Stripe basé uniquement sur snapshot et signaux validés.
- [x] 4.2 Ajouter l'action serveur de génération avec account context, résolution BYOK/shared, gestion de clé invalide et journalisation des tokens.
- [x] 4.3 Enregistrer les runs IA sans PII brute et rendre l'échec IA non bloquant pour les signaux déterministes.
- [x] 4.4 Ajouter les tests du contrat de prompt, de la sélection de clé et de la réponse d'erreur non sensible.

## 5. Interface `Insights Stripe`

- [x] 5.1 Ajouter les queries serveur account-scoped pour la devise active, la fraîcheur, le snapshot et les transactions visibles.
- [x] 5.2 Intégrer la barre période/devise/rafraîchissement à `Suivi des ventes` en conservant le CTA corail unique.
- [x] 5.3 Construire les KPI, la courbe de tendance, les comparaisons et leur résumé textuel accessible avec les primitives chart existantes.
- [x] 5.4 Construire les cartes de signaux avec preuve chiffrée, priorité, action et bouton IA violet non répété comme CTA principal.
- [x] 5.5 Ajouter l'alternative tabulaire, le détail transactionnel, les filtres et les états vide/chargement/erreur.
- [x] 5.6 Ajouter les états focus, aria-label, aria-live, reduced-motion, responsive mobile et absence de débordement horizontal.
- [x] 5.7 Ajouter les tests de rendu des snapshots et des états UI sans dépendre d'une API Stripe réelle.

## 6. Validation finale

- [x] 6.1 Lancer les tests Vitest ciblés puis la suite complète.
- [x] 6.2 Lancer `npm run typecheck` et corriger toutes les erreurs TypeScript.
- [x] 6.3 Lancer `npm run lint` et corriger toutes les violations.
- [x] 6.4 Vérifier le diff pour l'absence de secrets et vérifier `.env.example` si nécessaire.
- [x] 6.5 Démarrer l'application et parcourir les états protégés, vides et synchronisés avec agent-browser.
- [x] 6.6 Vérifier les largeurs 375, 768, 1024 et 1440 px, le clavier, les erreurs annoncées et reduced-motion avec agent-browser.
- [x] 6.7 Rejouer la validation OpenSpec et confirmer que la migration et toutes les tâches sont terminées.
