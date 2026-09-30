## Why

Le Pipeline doit distinguer un lead explicitement non intéressé des autres motifs de perte, sans transformer ce cas en nouvelle étape opérationnelle. Cette information existe déjà dans le modèle de lead et dans le dialogue « Perdu » ; il manque seulement une valeur contrôlée, localisée et importable.

## What Changes

- Ajouter « Non intéressé » comme motif contrôlé du résultat `Perdu`.
- Conserver les cinq étapes actuelles du Pipeline et ne créer aucune colonne supplémentaire.
- Rendre le motif disponible dans les dialogues de perte du CRM et de l’ancien Pipeline compatible.
- Ajouter les libellés français et anglais dans les catalogues correspondants.
- Accepter les variantes usuelles du motif lors des imports CRM.
- Conserver le comportement existant des leads perdus : ils restent réouvrables, et cette évolution ne modifie pas la gestion des actions ouvertes.

## Capabilities

### New Capabilities

- `crm-loss-reasons`: motifs de perte contrôlés, localisés, persistés et importables pour les leads CRM et legacy.

### Modified Capabilities

Aucune capacité existante dans `openspec/specs/` ne décrit actuellement le CRM ou le Pipeline.

## Impact

- Modèle Drizzle et enum PostgreSQL partagé `lead_lost_reason`, avec migration additive.
- Types, schémas Zod et normalisation des imports dans `lib/crm/` et `lib/leads/`.
- Dialogues de perte CRM et legacy dans `app/(app)/crm/` et `app/(app)/acquisition/pipeline/`.
- Catalogues `locales/fr` et `locales/en` pour les namespaces `crm` et `pipeline`.
- Tests de validation, d’import, de synchronisation des catalogues et de migration.
- Aucun changement prévu pour les étapes CRM, les KPI du funnel, l’extension, les webhooks ou les données existantes.
