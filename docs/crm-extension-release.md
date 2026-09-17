# Release de l’extension CRM

Ce document décrit le chemin de distribution de l’extension Chrome Minaly et
le contrôle de version associé.

## Distribution

Configurer les variables suivantes côté serveur :

- `CRM_EXTENSION_STORE_URL` : URL publique de la fiche Minaly dans le Chrome Web Store. Elle est prioritaire et constitue le parcours recommandé ;
- `CRM_EXTENSION_PACKAGE_URL` : URL HTTPS d’un ZIP pilote public, ou chemin relatif comme `/downloads/minaly-crm-latest.zip` ;
- `CRM_EXTENSION_PREVIOUS_VERSION` : dernière version publiée, à utiliser dans la CI ou avant une publication.

Si aucune URL n’est disponible, Minaly affiche un état non configuré et ne
présente aucun lien qui ne fonctionnerait pas.

## Préparer une release

1. Augmenter `version` dans `extension/manifest.json`.
2. Lancer `CRM_EXTENSION_PREVIOUS_VERSION=0.1.0 npm run extension:package` avec la version réellement publiée précédente.
3. Vérifier `public/downloads/minaly-crm-vX.Y.Z.zip` et son contenu.
4. Tester l’extension depuis le ZIP ou le dossier compilé.
5. Publier le ZIP versionné dans le Chrome Web Store depuis le compte éditeur.
6. Configurer `CRM_EXTENSION_STORE_URL` dans l’environnement de déploiement.

Le script produit aussi `minaly-crm-latest.zip`. Il est pratique pour un pilote
ou un test local, mais une installation chargée manuellement ne bénéficie pas
du cycle de mise à jour automatique du Chrome Web Store.

Le build applicatif exécute `npm run extension:package` avant `next build`. Le
package `latest` est donc disponible dans le déploiement qui affiche le guide.

## Mise à jour côté utilisateur

L’extension vérifie périodiquement la route publique
`/api/crm/extension/release`. La réponse expose uniquement la version, le type
de distribution et les URLs publiques. Elle ne donne aucun accès CRM.

Chrome peut également signaler qu’une version plus récente est déjà téléchargée.
Dans ce cas, Minaly affiche l’action de rechargement dans le panneau. Tant
qu’une capture ou une mise à jour de lead est en cours, l’action de rechargement
reste différée.

## Rollback

En cas de problème :

1. retirer ou remplacer l’URL de distribution concernée ;
2. conserver les routes `/api/crm/extension/session`, `/resolve`, `/capture` et `/update` compatibles avec les versions supportées ;
3. publier une version Chrome supérieure qui corrige le problème, sans réutiliser le numéro précédent ;
4. vérifier que le guide n’affiche plus la distribution désactivée.

Le rollback de l’extension ne supprime aucun lead, aucune session ni aucun
événement CRM.
