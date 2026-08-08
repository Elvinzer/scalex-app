## Why

Scale X génère déjà des diagnostics, des insights de funnel et des recommandations, mais ces éléments restent principalement des lectures ponctuelles. L’utilisateur peut comprendre quoi améliorer sans avoir une mémoire fiable de sa décision, une action reliée au Journal, une priorité hebdomadaire ni une preuve du résultat obtenu.

Cette change transforme un insight actionnable en boucle d’amélioration suivie, sans créer un CRM générique ni une couche de gamification lourde.

## What Changes

- Persister un historique account-scoped des insights actionnables, avec leur source, leur snapshot de données et leur décision (`à traiter`, `lancé`, `plus tard`, `écarté`, etc.).
- Ajouter le CTA `Je lance cette action` et relier l’insight à un projet ou une tâche existante du Journal.
- Permettre une seule priorité business active par semaine, visible depuis le Dashboard et le Journal.
- Rendre les actions assignables à un membre d’équipe autorisé, sans exposer d’action hors du compte ou d’une permission accessible.
- Capturer un snapshot de référence au lancement, comparer automatiquement le même indicateur après l’action lorsque la donnée est disponible et permettre le statut `Résultat mesuré`.
- Afficher l’évolution personnelle de l’exécution et les jalons significatifs, sans points artificiels ni classement global dans cette tranche.
- Faire relancer Falco de manière contextualisée les actions non terminées, avec une fréquence limitée et le respect des statuts `pause`, `écarté` et `terminé`.
- Conserver les sources métier existantes comme autorités ; le Journal agrège l’activité mais ne remplace ni le Diagnostic, ni Pipeline, ni les tables de métriques.

## Capabilities

### New Capabilities

- `insight-execution-history`: historique normalisé des insights actionnables, décisions, initiatives liées au Journal et assignation.
- `insight-impact-measurement`: snapshots de référence, comparaison avant/après et résultat mesuré avec calculs déterministes.
- `personal-progress-followup`: priorité hebdomadaire, progression personnelle et relances Falco anti-spam.

### Modified Capabilities

Aucune capacité publiée dans `openspec/specs/` n’est modifiée. Le changement réutilise la surface `À faire maintenant` livrée par `add-revenue-execution-actions`, sans modifier son contrat de projection en lecture seule.

## Impact

- Nouveau modèle de données et migration Drizzle pour les insights normalisés, les initiatives, le focus hebdomadaire et les snapshots de résultat ; RLS et account scoping obligatoires.
- Adaptateurs de lecture pour les insights du Diagnostic, du Funnel, des leviers, du contenu et du Copilote ; les tables sources existantes restent compatibles.
- Actions serveur et UI de `/diagnostic`, `/copilote`, `/journal` et `/dashboard`.
- Réutilisation des tables `projects`, `todos` et `improvement_events` plutôt qu’une nouvelle application de tâches.
- Extension du briefing hebdomadaire/Inngest pour les relances Falco, avec idempotence et respect des préférences utilisateur.
- Aucun nouveau canal d’envoi, aucune nouvelle dépendance et aucun leaderboard inter-comptes dans cette tranche.
