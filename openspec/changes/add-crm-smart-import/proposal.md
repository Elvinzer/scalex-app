## Why

Le CRM peut aujourd'hui capturer un lead à la main ou depuis l'extension, mais il ne sait pas reprendre un historique existant depuis un classeur volumineux. Les exports contiennent souvent beaucoup de colonnes, des doublons, des dates historiques et des informations mélangées ; l'utilisateur doit pouvoir laisser Falco proposer une transcodification, la vérifier, puis importer uniquement ce qu'il valide sans fausser les KPI CRM.

## What Changes

- Ajouter un import CRM depuis Excel, CSV, TSV ou collage en réutilisant le parseur et les limites de l'import Data.
- Ajouter une cible `crm_leads` au mapping Falco, feuille par feuille, avec une proposition de correspondance pour chaque colonne, des exemples, un niveau de confiance et une option d'ignorance.
- Demander le canal d'acquisition à l'échelle du fichier ou de la feuille quand aucune colonne ne permet de l'identifier ; ne jamais confondre canal d'acquisition et plateforme du profil.
- Permettre à l'utilisateur de valider, modifier ou ignorer chaque correspondance avant la prévisualisation.
- Importer la date historique de création du lead séparément de la date de capture par Minaly et utiliser cette date pour les premiers événements et l'historique CRM.
- Détecter les doublons par téléphone normalisé, afficher les lignes fusionnables et les conflits, puis éviter toute suppression silencieuse.
- Rapprocher les lignes avec les leads existants, compléter les champs vides par défaut et demander une décision pour les valeurs contradictoires.
- Créer les leads, événements et historiques via une transaction CRM idempotente, avec une source `migration` et un journal d'import auditable.
- Revalider les KPI et les pages CRM après import, sans modifier le comportement de l'import mensuel existant.
- Ajouter les états, erreurs, questions et résultats dans les catalogues FR et EN.

## Capabilities

### New Capabilities

- `crm-smart-import`: import assisté par Falco de fichiers CRM, transcodification validée, contexte de canal, dédoublonnage par téléphone, rapprochement avec l'existant et écritures CRM datées.

### Modified Capabilities

Aucune capacité principale de `openspec/specs/` ne décrit encore le CRM ou l'import Data. Les exigences existantes de capture CRM et d'import mensuel vivent dans des changes actifs et doivent rester compatibles.

## Impact

- `components/import/`, `lib/import/` et `lib/agent/import-mapping.ts` pour le parseur, le mapping, les questions et la prévisualisation.
- `app/api/import/` et les actions serveur pour l'analyse, l'autorisation et le commit CRM.
- `app/(app)/crm/leads/` et les composants CRM pour le bouton d'import et la revue.
- `lib/crm/`, `db/schema.ts` et une migration Drizzle pour le téléphone normalisé, le journal d'import et les écritures datées.
- `locales/en/` et `locales/fr/` pour tous les libellés visibles.
- Tests unitaires de parsing, normalisation, mapping, dédoublonnage, KPI et isolation compte ; test avec le classeur `KPI 2026.xlsx` sans le versionner dans le dépôt.
