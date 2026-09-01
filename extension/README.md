# Extension Chrome Minaly CRM

Cette extension MV3 ajoute un bouton flottant sur les profils Instagram et LinkedIn visibles dans le DOM.

## Build local

Depuis la racine du projet :

```bash
npx tsc -p extension/tsconfig.json
```

Puis charger le dossier `extension/` comme extension non empaquetée dans Chrome. Le dossier `dist/` est produit par la commande de build et n’est pas une source métier.

## Contrat

- aucun appel Meta ou LinkedIn ;
- aucune lecture d’API privée ;
- aucun message ou commentaire automatique ;
- URL, handle et nom viennent uniquement du DOM visible ;
- la session CRM est un bearer token court généré par `/api/crm/extension/session` dans le service worker ;
- le content script ne lit ni ne copie les cookies Supabase : les appels passent par le relais du service worker ;
- les endpoints `/resolve` et `/capture` revérifient la session, le tenant et les droits ;
- le responsable affiché dans la carte reste en lecture seule ;
- une correspondance ambiguë exige un choix explicite avant capture.

Définir `CRM_EXTENSION_SESSION_SECRET` côté serveur avec au moins 32 caractères avant d’utiliser la session bearer en production.
