## Why

Une fiche CRM ne peut actuellement porter qu'un seul profil social. Un lead
capturé sur WhatsApp ne peut donc pas être retrouvé depuis Instagram, et la
confirmation d'une correspondance peut remplacer l'identité sociale déjà
enregistrée. Cette évolution doit réunir les profils d'un même lead sans
perdre son origine, son responsable ou son historique, tout en gardant la
résolution de l'extension assez rapide pour rester naturelle à l'usage.

## What Changes

- Ajouter plusieurs profils sociaux à une même fiche lead, avec une identité
  canonique par réseau et une unicité limitée au compte CRM.
- Conserver les champs legacy pendant la transition et rattacher les anciens
  profils sans recréer ni fusionner silencieusement des leads.
- Ajouter un lien WhatsApp calculé à partir du téléphone normalisé au format
  international `https://wa.me/<digits>`.
- Chercher un lead depuis l'extension sur tous les réseaux du compte actif :
  URL exacte, téléphone ou email, puis nom et pseudo normalisés, avec une
  présélection courte et explicable.
- Demander une confirmation explicite pour les correspondances fondées sur des
  signaux faibles et conserver les homonymes ou conflits visibles.
- Garantir que la résolution, le cache et le rattachement restent strictement
  limités au compte CRM courant, y compris lors d'un changement de compte.
- Publier l'évolution avec une nouvelle version de l'extension Chrome, un
  package versionné et des tests de compatibilité de release.

## Capabilities

### New Capabilities

- `crm-multi-channel-lead-identity`: profils sociaux multiples, lien WhatsApp
  dérivé du téléphone et migration additive des identités existantes.
- `crm-fast-lead-reconciliation`: résolution cross-réseaux, suggestions
  rapides et explicables dans l'extension, avec isolation stricte du compte.
- `crm-extension-release`: versionnement, packaging et détection de mise à
  jour de l'extension pour cette évolution.

### Modified Capabilities

Les capacités CRM de la précédente évolution ne sont pas encore archivées dans
`openspec/specs/`. Les nouveaux contrats sont donc créés comme capacités
autonomes ci-dessus ; l'implémentation devra rester compatible avec les
comportements CRM existants.

## Impact

- `db/schema.ts`, migrations Drizzle et politiques RLS pour la collection de
  profils account-scoped et ses index.
- `lib/crm/queries.ts`, normalisation, imports et endpoints d'extension pour
  la résolution, le rattachement idempotent et la compatibilité legacy.
- `app/(app)/crm/` et les composants de fiche lead pour afficher les profils,
  le téléphone et l'action WhatsApp.
- `extension/src/`, `extension/manifest.json`, les artefacts `dist` et le
  package ZIP versionné.
- Tests CRM, tests d'isolation, tests de performance de résolution et tests de
  release de l'extension.
- Catalogues i18n français et anglais pour les nouveaux libellés et états.
