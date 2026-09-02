# Extension Chrome Minaly CRM

Cette extension MV3 ajoute un bouton flottant sur les profils Instagram et LinkedIn visibles dans le DOM.

## Build local

Depuis la racine du projet :

```bash
npx tsc -p extension/tsconfig.json
```

Puis charger le dossier `extension/` comme extension non empaquetée dans Chrome. Le dossier `dist/` est produit par la commande de build et n’est pas une source métier.

En production, l’extension appelle `https://www.minaly.io`. Après une mise à jour du build, recharge l’extension depuis `chrome://extensions` pour remplacer le service worker compilé.

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
