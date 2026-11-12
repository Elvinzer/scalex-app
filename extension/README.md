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
La version `0.3.0` peut aussi proposer une fiche existante sur un autre réseau
ou lancer une recherche manuelle dans le compte connecté.
La version `0.3.1` fiabilise la fermeture du panneau depuis la croix sur les
pages Instagram et LinkedIn. La version `0.3.2` place le bouton à côté du
contact actif dans les conversations globales et réduites, sans le confondre
avec le compte Instagram connecté.
La version `0.3.3` ouvre la fiche lead Minaly depuis le panneau et retire le
suivi de réponse dès que l’étape atteint « Conversation en cours ».
La version `0.3.5` lit le nom depuis la zone d’identité du profil et utilise le
handle normalisé lorsqu’aucun nom fiable n’est visible.
La version `0.3.6` limite la détection des messages aux pages de conversation
et exclut des tests les leads dont une conversation existait avant la capture.
La version `0.3.7` récupère la session après une erreur réseau et affiche un
état de connexion distinct d’un problème de profil.
La version `0.3.8` comptabilise le message dès sa copie et actualise le profil
actif quand tu changes de conversation sans recharger la page.
La version `0.3.9` attend l’identité chargée tardivement et recrée le bouton si
Instagram retire son élément pendant une navigation.
La version `0.3.10` débloque le bouton quand l’identité de la conversation
arrive tardivement et permet de changer l’étape d’un lead avec une variante A/B.
La version `0.3.11` demande de choisir le business lors de la connexion et
conserve ce choix pendant le renouvellement de session. Le nom affiché en haut
du panneau permet de reconnecter l’extension à un autre business.
La version `0.3.12` limite la capture LinkedIn aux profils personnels `/in/`
et refuse les appels CRM si le jeton lié au business sélectionné ne peut pas
être renouvelé. Les appels de l’extension n’utilisent pas les cookies de la
session web comme solution de repli.
La version `0.3.13` ignore le composeur de messagerie flottant de LinkedIn
quand un profil personnel est ouvert, afin de garder le bouton près du nom.
La version `0.3.14` prend aussi en charge le titre de profil LinkedIn quand
la page ne l'expose pas dans un élément `h1`.
La version `0.3.15` ancre le bouton sur le lien du nom dans la carte de profil
LinkedIn et retire le texte d'accessibilité du nom capturé.
La version `0.3.16` reconnaît aussi le lien du profil quand LinkedIn lui donne
une URL absolue.
La version `0.3.17` autorise la page de retour d’authentification depuis
minaly.io et localhost pour que Chrome puisse terminer la connexion.

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
