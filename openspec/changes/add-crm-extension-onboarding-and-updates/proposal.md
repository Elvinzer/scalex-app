## Why

L'extension CRM existe déjà, mais son installation reste réservée à un
parcours technique et son cycle de mise à jour n'est pas encore relié à
Minaly. Les utilisateurs CRM doivent pouvoir l'installer depuis un lien clair,
terminer la connexion sans configuration manuelle et recevoir une indication
fiable lorsqu'une nouvelle version est disponible.

## What Changes

- Ajouter une suggestion contextuelle sur l'accueil CRM pour les membres qui
  ont accès au module.
- Ajouter une page `/crm/extension` avec un guide court, progressif et
  responsive, sans bloquer l'utilisation du CRM.
- Utiliser le Chrome Web Store comme parcours d'installation principal, avec
  un lien de secours vers le package de pilote lorsque la distribution publique
  n'est pas encore configurée.
- Afficher les prérequis, les permissions demandées, le fonctionnement de la
  capture DOM et les limites de l'extension avant l'installation.
- Ajouter une vérification d'installation et de connexion qui distingue
  extension absente, extension connectée, session expirée et CRM désactivé.
- Déclarer la version courante de l'extension et l'URL du dernier package dans
  une configuration unique côté serveur.
- Ajouter un flux de release qui compile l'extension, vérifie l'incrément de
  version, produit le package ZIP et conserve un artefact `latest`.
- Permettre à l'extension de signaler qu'une mise à jour est disponible et de
  proposer son application après la fin d'une opération en cours.
- Afficher une action `Mettre à jour` qui renvoie vers la distribution
  officielle ou, pour le pilote, vers le dernier package versionné.
- Documenter la publication, le versionnement, le rollback et la compatibilité
  entre les routes API CRM et les anciennes versions de l'extension.
- Ajouter toutes les chaînes visibles dans les catalogues FR et EN.

## Capabilities

### New Capabilities

- `crm-extension-onboarding`: suggestion dans le CRM, guide d'installation,
  prérequis, connexion, vérification et dépannage.
- `crm-extension-release`: versionnement, packaging, distribution du dernier
  package et signalement des mises à jour.

### Modified Capabilities

Aucune capacité OpenSpec existante ne décrit encore le parcours d'installation
ou la distribution de l'extension. Les capacités CRM et capture existantes ne
changent pas leur contrat métier.

## Impact

- `app/(app)/crm/` pour la suggestion et la page de guide.
- `locales/en/crm.json` et `locales/fr/crm.json` pour les libellés.
- `extension/` pour la version, le contrôle de mise à jour et le package.
- `scripts/` et `package.json` pour le build et le release local/CI.
- `.env.example` pour l'URL Chrome Web Store et, si nécessaire, l'URL du
  package de pilote.
- API CRM extension pour exposer la version compatible et les informations de
  distribution, sans modifier les données de leads.
- Documentation de release et tests runtime desktop, mobile, accès et
  affichage des états.
