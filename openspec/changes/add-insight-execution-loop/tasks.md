## 1. Data model and migration

- [x] 1.1 Définir les enums et schémas Zod des sources d’insight, décisions, statuts d’initiative, focus hebdomadaire et snapshots de résultat
- [x] 1.2 Ajouter les tables `insight_records`, `improvement_initiatives` et le focus hebdomadaire avec RLS, index account-scoped et contraintes d’unicité
- [x] 1.3 Ajouter les liens optionnels vers `projects`, `todos` et `team_members` avec les règles d’on-delete adaptées
- [x] 1.4 Générer et appliquer la migration Drizzle ; vérifier les policies RLS owner/membre et ne jamais utiliser `db push`

## 2. Insight history and source adapters

- [x] 2.1 Créer le contrat serveur account-scoped de matérialisation/déduplication d’un insight actionnable
- [x] 2.2 Adapter les insights `funnel_stage_insights` sans supprimer ni casser leur historique existant
- [x] 2.3 Adapter les recommandations Diagnostic, leviers structurés et contenu avec snapshot de contexte et fingerprint stable
- [x] 2.4 Définir le comportement des conversations libres : aucune matérialisation sans action explicite dans la première tranche
- [x] 2.5 Ajouter les requêtes d’historique avec filtres statut/source/période et tests de cloisonnement de compte

## 3. Launch, Journal and weekly focus

- [x] 3.1 Implémenter la machine de décision et d’initiative avec transitions validées côté serveur
- [x] 3.2 Implémenter `Je lance cette action` avec création ou liaison idempotente d’une tâche/projet Journal
- [x] 3.3 Écrire les événements `improvement_events` pour lancement, jalon, terminaison et résultat sans en faire la source d’état
- [x] 3.4 Implémenter le focus hebdomadaire transactionnel avec une seule priorité par compte et semaine
- [x] 3.5 Ajouter l’assignation au membre actif et le contrôle des permissions de lecture/mutation

## 4. Baseline and impact measurement

- [x] 4.1 Implémenter les snapshots de baseline calculés côté serveur pour les métriques de funnel et de revenu supportées
- [x] 4.2 Implémenter le moteur de période comparable et les deltas de taux en points de pourcentage
- [x] 4.3 Implémenter les formules cash déterministes supportées et les libellés `observé`, `estimé` et `non calculable`
- [x] 4.4 Implémenter la revue, le statut `résultat mesuré`, le snapshot immuable et les nouvelles versions de mesure
- [x] 4.5 Ajouter les tests sur données manquantes, périodes incompatibles, resynchronisation et absence de causalité inventée

## 5. Dashboard, Diagnostic and Journal UX

- [x] 5.1 Ajouter l’historique des insights dans Diagnostic sans nouvelle destination de navigation principale
- [x] 5.2 Ajouter les CTA décision/lancement, l’état d’initiative, la priorité hebdomadaire et le lien vers le Journal
- [x] 5.3 Ajouter la carte `Élan de la semaine` au Dashboard et la progression historique dans le Journal
- [x] 5.4 Ajouter les états membre assigné, permission partielle, absence de données, attente de mesure et erreur
- [x] 5.5 Vérifier responsive, clavier, focus, reduced motion et respect du CTA corail unique

## 6. Falco follow-up and celebration

- [x] 6.1 Définir la fenêtre de relance et la clé d’idempotence par initiative/semaine
- [x] 6.2 Étendre le briefing hebdomadaire/Inngest avec des relances contextualisées et account-scoped
- [x] 6.3 Ajouter les actions `Reporter` et `Mettre en pause` persistantes avec suppression des relances futures
- [x] 6.4 Ajouter les célébrations limitées aux jalons significatifs et respecter `prefers-reduced-motion`
- [x] 6.5 Ne pas ajouter de points, monnaie, leaderboard ou nouvelle entrée de navigation

## 7. Validation

- [x] 7.1 Ajouter les tests unitaires de transitions, idempotence, focus hebdomadaire, assignation et account scoping
- [x] 7.2 Ajouter les tests de mesure avant/après et des libellés d’impact
- [ ] 7.3 Parcourir les scénarios owner/membre avec `agent-browser` sur Dashboard, Diagnostic et Journal
- [x] 7.4 Lancer `npm run typecheck`, `npm run lint` et la validation OpenSpec
- [x] 7.5 Vérifier l’absence de secrets/PII dans les snapshots, URLs, logs, emails et événements Falco

> QA note: l’audit des fichiers ajoutés et modifiés ne trouve aucun secret, token de session, clé API ou donnée personnelle dans les snapshots, événements Journal, relances Falco ou nouveaux liens UI. Les identifiants `user.id` déjà présents dans les URLs du briefing hebdomadaire existant n’ont pas été ajoutés par cette change.

> QA note: `agent-browser` a vérifié la matrice owner sur Dashboard, Diagnostic et Journal dans une session neuve, les guards non authentifiés correspondants, ainsi que le rendu de la page de connexion. La page Équipe ne contient actuellement qu’une invitation en attente, sans membre actif ni session membre légitime ; la matrice membre reste donc à exécuter dès qu’un membre rejoint réellement le compte. Aucun bypass d’authentification n’a été ajouté pour fabriquer ce test.
