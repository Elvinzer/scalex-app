## Why

La page Contenu sépare aujourd’hui la vue globale et les détails Instagram/YouTube en plusieurs routes. Passer d’une plateforme à l’autre impose donc de revenir à l’overview puis de rouvrir un détail, ce qui casse le contexte et rend l’exploration des performances inutilement lente.

Le design précédent affichait un sélecteur de plateforme persistant et une seule vue détaillée à la fois. Nous voulons restaurer cette expérience tout en conservant les corrections de données et les métriques spécialisées ajoutées depuis.

## What Changes

- Remplacer le parcours overview → carte réseau → sous-page par un sélecteur de plateforme directement sur `/acquisition/contenu`.
- Afficher une seule vue de contenu à la fois : Instagram ou YouTube, selon la plateforme sélectionnée.
- Restaurer la carte complète de connexion/synchronisation dans le panneau de la plateforme sélectionnée, avec CTA de connexion pour une plateforme non connectée et actions/statut pour une plateforme connectée.
- Préserver intégralement les affichages spécifiques à Instagram et YouTube : filtres, KPI, top 3, tableaux, colonnes, explications et dialogues de détail.
- Conserver la période sélectionnée lors d’un changement de plateforme et préserver les filtres propres à chaque plateforme lorsque l’utilisateur y revient.
- Rendre la plateforme sélectionnée partageable et restaurable via l’URL, sans casser les anciennes URLs de détail.
- Garder uniquement Instagram et YouTube dans le périmètre de cette évolution ; aucune nouvelle intégration sociale n’est introduite.
- Conserver le filtrage par source Instagram et l’exclusion des vidéos YouTube privées ou non listées de toutes les métriques concernées.

## Capabilities

### New Capabilities

- `content-platform-switching`: sélectionner rapidement une plateforme de contenu, afficher son panneau détaillé et conserver le contexte de navigation et de filtrage.

### Modified Capabilities

- Aucune capability existante de `openspec/specs/` ne décrit actuellement la page Contenu.

## Impact

- Page et composants de `app/(app)/acquisition/contenu/` : shell de sélection, chargement des données et composition des vues.
- Composants de connexion Instagram/YouTube réaffichés dans le contexte de la plateforme sélectionnée.
- Parcours de navigation et compatibilité des URLs de détail Instagram/YouTube.
- Tests end-to-end `agent-browser`, responsive et accessibilité de la page Contenu.
- Aucun changement prévu dans le schéma de données, les APIs d’intégration ou les dépendances.
