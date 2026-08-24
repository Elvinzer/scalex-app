## Why

Le premier écran après une connexion réussie doit être le Dashboard, qui donne immédiatement la situation business et le goulot prioritaire. Le funnel du goulot est déjà calculé avec des sources fiables, mais l’interface ne dit pas clairement où retrouver chaque donnée et cache son détail derrière un bouton peu utile.

## What Changes

- Rediriger les comptes propriétaires ayant terminé l’onboarding vers `/dashboard` après connexion.
- Afficher sous chaque étape du goulot un libellé de source cliquable vers la page qui alimente la donnée.
- Remplacer « Saisir une ventilation » par « Saisir les données » dans les catalogues français et anglais.
- Supprimer le bouton « Voir le détail » et sa boîte de dialogue dédiée.
- Afficher directement sous le funnel le détail des étapes et du potentiel total, avec des couleurs lisibles dans les thèmes clair et sombre.
- Conserver le dialogue Falco ouvert depuis l’icône d’amélioration de chaque étape.

## Capabilities

### New Capabilities

- `dashboard-bottleneck-clarity`: définit le landing post-auth du Dashboard et la présentation explicable, navigable et inline du funnel du goulot.

### Modified Capabilities

<!-- Aucun contrat existant dans openspec/specs/ ne couvre actuellement le Dashboard ou le funnel du goulot. -->

## Impact

- `lib/team/context.ts` et ses tests de landing post-auth.
- `app/(app)/dashboard/bottleneck-funnel.tsx` pour les liens de source et le détail inline.
- `locales/fr/dashboard.json`, `locales/en/dashboard.json`, `locales/fr/funnelBlocks.json` et `locales/en/funnelBlocks.json`.
- Tests de traductions, de navigation et de rendu du Dashboard ; aucune migration DB, nouvelle dépendance ou API externe.
