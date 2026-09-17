## Context

Voir `proposal.md` pour la motivation. Le CRM est déjà protégé par
`requireCrmAccess` et son layout expose exactement cinq sous-pages. L'extension
est compilée par `extension:build`, sa version actuelle est dans
`extension/manifest.json` et son README ne décrit pour l'instant qu'un
chargement local du dossier `extension/`.

Le package doit rester indépendant des données CRM. Les routes de capture,
résolution et session existantes sont la source de vérité pour l'accès, les
permissions et les leads.

## Goals / Non-Goals

**Goals:**

- Donner un parcours d'installation court à tous les membres qui peuvent
  utiliser le CRM.
- Garder la page CRM principale centrée sur les KPI et les actions.
- Publier le Chrome Web Store comme parcours normal et fournir un package de
  pilote versionné comme secours.
- Produire le package depuis une liste de fichiers explicite, sans secret et
  sans dépendance d'exécution supplémentaire.
- Signaler une mise à jour sans rechargement forcé pendant une capture.
- Conserver le fonctionnement des anciennes versions compatibles pendant le
  déploiement progressif.

**Non-Goals:**

- Publier automatiquement sur le Chrome Web Store sans identifiants de
  publication fournis par l'équipe.
- Détecter l'installation de l'extension avec une prétendue certitude lorsque
  le navigateur n'a pas réalisé de handshake.
- Permettre à l'extension de modifier les responsables, de valider une vente
  ou d'envoyer des messages sociaux.
- Ajouter une nouvelle table, un état CRM ou une migration de données.

## Decisions

### 1. Utiliser une page dédiée, sans sixième onglet

La suggestion est rendue uniquement sur `/crm` afin de ne pas répéter un bloc
sur chaque sous-page. Le guide vit sur `/crm/extension`, sous le layout CRM,
mais n'est pas ajouté à `PILLAR_SUBPAGES`. L'utilisateur peut donc le retrouver
par URL sans modifier la navigation métier existante.

Alternative écartée : ajouter un onglet `Extension`. Les cinq onglets actuels
sont le parcours CRM principal et doivent rester stables.

### 2. Prioriser le Chrome Web Store et expliciter le pilote

`CRM_EXTENSION_STORE_URL` est la distribution principale quand elle est
configurée. `CRM_EXTENSION_PACKAGE_URL` permet de pointer vers un ZIP produit
par le projet ou vers un artefact externe. Si aucune des deux n'est disponible,
le guide affiche un état non configuré et aucun lien cassé.

Le package local par défaut sera `/downloads/minaly-crm-latest.zip` lorsqu'il a
été produit pendant le build. Le bouton Web Store reste prioritaire pour éviter
de demander à un client de charger une extension non empaquetée.

### 3. Centraliser les informations de release

`lib/crm/extension-release.ts` lira la version du manifest et validera les URLs
de distribution. Le même modèle alimentera la page `/crm/extension` et la
route publique `GET /api/crm/extension/release`. La réponse de cette route ne
contiendra que la version, le type de distribution et des URLs publiques.

La route acceptera une version courante optionnelle, la comparera avec une
fonction déterministe de comparaison de versions Chrome et retournera
`updateAvailable`. Elle sera limitée en débit et mise en cache brièvement côté
client de l'extension. Aucune version fournie par le client ne donnera un droit
d'accès.

### 4. Générer un ZIP portable sans nouvelle dépendance

`npm run extension:package` exécutera le build TypeScript puis un script Node
qui empaquette seulement :

- `manifest.json` ;
- `auth-callback.html` ;
- `dist/background.js`, `dist/content.js` et `dist/auth-callback.js`.

Le script créera un fichier versionné et `minaly-crm-latest.zip` dans
`public/downloads/`, ainsi qu'un fichier de métadonnées local pour les tests.
La version devra être un numéro Chrome valide et un contrôle de version
précédente empêchera de produire deux releases identiques.

Alternative écartée : ajouter une librairie ZIP uniquement pour ce flux. Le
package peut être produit avec les primitives Node afin de limiter la surface
de dépendances et les audits associés.

### 5. Signaler la mise à jour dans l'extension

Le service worker conservera la version de `chrome.runtime.getManifest()` et
pourra consulter la route release. Il écoutera aussi
`chrome.runtime.onUpdateAvailable`, qui signale qu'une version est déjà
téléchargée par Chrome. Le content script recevra un état court et affichera un
bloc de mise à jour dans la carte Minaly.

L'action de mise à jour sera différée pendant les états `loading`. Si Chrome a
déjà téléchargé la version, elle pourra demander le rechargement de l'extension
après le clic. Sinon, elle ouvrira l'URL Web Store ou le package pilote. Le
pilote restera explicitement manuel, car un ZIP téléchargé ne possède pas le
même cycle d'auto-update qu'une extension installée depuis le Web Store.

### 6. Garder la page et le guide simples

La page sera un Server Component par défaut. Elle affichera un parcours en
quatre étapes maximum, des liens explicites, une note de confidentialité et un
bloc de dépannage. Les actions utiliseront les composants Button et les tokens
de la DA existante. Aucun hexadécimal ni couleur brute ne sera ajouté.

Le bloc de suggestion sera un petit composant client uniquement pour mémoriser
le masquage local. Il gardera un espace stable, un bouton de masquage accessible
et un statut `aria-live` unique pour les états de release.

### 7. Automatiser les contrôles de release

Les tests vérifieront le manifest, le contenu du ZIP, la comparaison de
versions, les distributions disponibles, les réponses de la route et les
états de guide. `vercel-build` produira le package avant `next build` afin que
le package `latest` soit disponible dans le déploiement qui affiche le guide.

La publication Chrome Web Store restera une étape externe : le projet
produira le ZIP et documentera la commande d'upload, mais ne stockera aucun
jeton de publication.

## Risks / Trade-offs

- [La validation Web Store retarde une nouvelle version] → Afficher la version
  du package réellement disponible, garder le lien pilote pour les tests et ne
  pas prétendre qu'une version est installée.
- [Une installation pilote demande encore des clics Chrome] → La garder hors
  du parcours normal et rendre le Web Store prioritaire dès que son URL existe.
- [Le navigateur ne permet pas de confirmer l'installation depuis la page web]
  → Afficher un état de distribution et une version disponible, puis utiliser
  le handshake de l'extension seulement quand il existe.
- [La page ajoute un appel release public] → Réponse minimale, validation stricte,
  rate limiting et absence de donnée CRM.
- [Une mise à jour arrive pendant une capture] → Conserver l'état en attente et
  ne proposer l'application qu'après la fin de l'opération.

## Migration Plan

1. Ajouter les URLs de distribution dans l'environnement de déploiement, sans
   secret et avec le package pilote comme secours.
2. Déployer le guide et le package `latest` avec l'extension actuelle.
3. Publier l'extension sur le Chrome Web Store depuis le ZIP versionné, puis
   configurer `CRM_EXTENSION_STORE_URL`.
4. Pour chaque modification, augmenter la version du manifest, lancer le build
   et le package, tester le ZIP, puis publier la nouvelle version.
5. En cas de problème, retirer ou remplacer l'URL de distribution et laisser
   les routes CRM existantes fonctionner. Aucune donnée CRM n'est supprimée.

## Open Questions

Aucune question ne bloque l'implémentation. La publication effective sur le
Chrome Web Store dépendra d'un compte éditeur externe et sera traitée comme une
opération de release après validation locale.
