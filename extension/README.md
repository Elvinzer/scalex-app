# Extension Chrome Minaly CRM

Cette extension MV3 ajoute un bouton Minaly à côté du nom des profils Instagram et LinkedIn visibles dans le DOM. Elle conserve un affichage flottant temporaire si le nom n’est pas encore rendu par la plateforme.

## Installer l’extension

Le parcours recommandé passe par le Chrome Web Store. Quand l’URL du Store est
configurée dans Minaly, ouvre `/crm/extension` puis clique sur `Installer ou
mettre à jour`. Chrome gère ensuite les mises à jour de l’extension.

Pour un pilote privé, le guide propose le dernier package ZIP. Télécharge-le,
décompresse-le, ouvre `chrome://extensions`, active le mode développeur et
clique sur `Charger l’extension non empaquetée`. Sélectionne le dossier
décompressé et garde-le au même endroit pour pouvoir le recharger après une
mise à jour.

Après l’installation, ouvre l’extension sur un profil Instagram ou LinkedIn
visible, clique sur `Se connecter à Minaly`, puis reviens sur le profil. Le
panneau confirme la connexion et permet d’ajouter ou de mettre à jour le lead.

## Construire le package local

Depuis la racine du projet :

```bash
npm run extension:package
```

La commande compile les trois entrées TypeScript et produit :

- `public/downloads/minaly-crm-vX.Y.Z.zip` ;
- `public/downloads/minaly-crm-latest.zip` ;
- `public/downloads/minaly-crm-latest.json`.

Les fichiers générés sont ignorés par Git et inclus dans le build Vercel.

Avant une publication, définir `CRM_EXTENSION_PREVIOUS_VERSION` avec la
dernière version publiée. Le package échoue si la version du manifest n’est
pas strictement supérieure. Pour chaque modification, augmenter
`extension/manifest.json`, lancer le package, vérifier son contenu puis publier
le ZIP versionné.

En production, l’extension appelle `https://www.minaly.io`. Après une mise à jour du build, recharge l’extension depuis `chrome://extensions` pour remplacer le service worker compilé.

Quand une mise à jour est détectée, le panneau Minaly affiche la nouvelle
version. Si Chrome l’a déjà téléchargée, l’action la recharge. Sinon, elle
ouvre le Chrome Web Store ou le dernier package pilote. Une capture ou une
modification en cours garde la priorité.

Au premier usage, « Se connecter à Minaly » ouvre la session web Minaly dans un onglet. Le parcours accepte Google et le magic link habituels, puis renvoie un jeton court signé à l’extension via `auth-callback.html`. Le jeton est conservé uniquement dans le stockage local de l’extension et est supprimé lorsqu’il expire.

## Contrat

- aucun appel Meta ou LinkedIn ;
- aucune lecture d’API privée ;
- aucun message ou commentaire automatique ;
- URL, handle et nom viennent uniquement du DOM visible ; l’URL canonique est conservée sur le lead et reste accessible depuis sa fiche ;
- la session CRM est un bearer token court généré par `/api/crm/extension/session` ou par le callback d’authentification web ;
- le content script ne lit ni ne copie les cookies Supabase : les appels passent par le relais du service worker ;
- les endpoints `/resolve` et `/capture` revérifient la session, le tenant et les droits ;
- le responsable affiché dans la carte reste en lecture seule et correspond à l’e-mail de la session Minaly connectée ;
- lorsqu’un seul produit est configuré, il est présélectionné dans la capture et appliqué côté serveur ;
- une correspondance ambiguë exige un choix explicite avant capture.

Définir `CRM_EXTENSION_SESSION_SECRET` côté serveur avec au moins 32 caractères avant d’utiliser la session bearer en production.

La procédure de publication, les variables de distribution et le rollback sont
détaillés dans [`docs/crm-extension-release.md`](../docs/crm-extension-release.md).
