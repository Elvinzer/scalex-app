## Context

Le flux d’authentification possède déjà une résolution commune de destination post-authentification, mais les propriétaires ayant terminé l’onboarding y retombent encore sur `/roadmap`. Le funnel du Dashboard conserve déjà un `sourceHref` par étape et rend chaque ligne entière navigable ; il manque seulement une indication visuelle de cette destination. Son potentiel détaillé est actuellement rendu dans une boîte de dialogue ouverte par un CTA placé sous le funnel.

## Goals / Non-Goals

**Goals:**

- Centraliser le changement de landing propriétaire dans la résolution post-auth existante.
- Réutiliser les destinations de source déjà calculées par les étapes, sans ajouter de modèle de données.
- Garder un seul lien accessible par étape pour éviter les ancres imbriquées, tout en ajoutant un libellé de source visible dans ce lien.
- Transformer le contenu du résumé existant en section inline claire et réutiliser les mêmes calculs et filtres.
- Maintenir la parité des catalogues FR/EN et les contrôles i18n existants.

**Non-Goals:**

- Ne pas changer le parcours d’onboarding des nouveaux comptes.
- Ne pas modifier les permissions des membres d’équipe ni l’ordre de leurs destinations accessibles.
- Ne pas modifier les calculs de taux, de benchmarks ou de potentiel du funnel.
- Ne pas changer le dialogue Falco lié à l’amélioration d’une étape.
- Ne pas ajouter de migration, d’API ou de dépendance.

## Decisions

### Destination post-auth

La résolution déjà appelée par magic link, OAuth, `/sign-in` avec session active et confirmation email sera la seule source de vérité pour le landing des propriétaires existants. Elle renverra `/dashboard` lorsque l’onboarding est terminé ; les branches onboarding et membres resteront inchangées. Cette option évite de corriger séparément chaque fournisseur d’authentification.

### Libellé de source

Le composant conservera la destination `sourceHref` existante et déterminera un nom de page localisé à partir de cette destination et du type de source. Le texte sera rendu dans le lien de l’étape déjà présent, ce qui évite une structure HTML avec un lien imbriqué tout en rendant la provenance explicitement visible et cliquable.

### Résumé inline

Le contenu actuellement monté dans le dialogue de résumé sera déplacé sous la liste des étapes dans une section à fond de carte, avec `text-foreground` pour les valeurs principales et `text-muted-foreground` pour l’explication. Le bouton, l’état React d’ouverture et le dialogue de résumé disparaîtront ; le dialogue Falco restera indépendant.

### Traductions

Les nouvelles clés de provenance et les libellés modifiés seront ajoutés simultanément dans les fichiers FR/EN correspondants. La clé partagée du filtre de sources sera mise à jour, car elle est utilisée par le Dashboard et les pages Acquisition qui demandent la même action de saisie.

## Risks / Trade-offs

- **[Les libellés de source divergent d’une route à l’autre]** → Utiliser une table de correspondance centralisée dans le composant et tester toutes les destinations actuellement produites par le funnel.
- **[Un texte de source trop discret reste invisible]** → Utiliser le token d’accent texte et l’underline au survol/focus, avec un contraste normal pour l’état par défaut.
- **[La suppression du dialogue perd une information]** → Reprendre l’intégralité de son contenu dans le bloc inline, y compris les lignes d’étapes, la description et le total.
- **[Un changement global du libellé affecte les pages Acquisition]** → Vérifier les deux surfaces dans le test de rendu et conserver une formulation cohérente avec la saisie de données existante.
