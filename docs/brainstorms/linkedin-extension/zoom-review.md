# Revue Zoom Out : capture LinkedIn

Mode : BRAINSTORM. Revue statique du concept et du code local, sans exécution de l'extension ni consultation des liens concurrents. Les constats ci-dessous ne prouvent pas le comportement actuel de LinkedIn.

## Conclusion

Le besoin est cohérent avec le CRM existant, mais il ressemble à une fiabilisation et une clarification du parcours déjà présent. Il ne justifie pas une nouvelle extension, une nouvelle intégration LinkedIn, un nouveau moteur de rapprochement ou un modèle de données parallèle. La plus petite livraison utile est le parcours existant, limité au profil personnel standard, avec identité fiable et business explicite.

## Risques et réutilisation

### 1. Major : traiter comme nouvelle architecture une fonctionnalité déjà câblée

- Dimension : Contrarian / YAGNI & Code Minimization.
- Constat : `content.ts` détecte déjà LinkedIn, lit son titre de profil, construit une URL canonique et utilise le même panneau et les mêmes appels resolve/capture que pour Instagram. Le manifest charge déjà ce script sur LinkedIn.
- Risque : créer un second panneau ou une branche complète LinkedIn dupliquerait la qualification, les états de connexion, la recherche et la gestion des erreurs.
- Alternative : vérifier d'abord le parcours existant sur un vrai profil LinkedIn. Corriger seulement la reconnaissance du profil et les écarts observés. Aucun service tiers supplémentaire ne paraît nécessaire pour cette capture manuelle depuis le DOM.

### 2. Major : le périmètre réel du détecteur dépasse le concept approuvé

- Dimension : Contrarian / YAGNI & Code Minimization.
- Constat : `minalyProfilePath` accepte `/in/` et `/company/`. `minalyProfileUrl` cherche d'abord une conversation, puis le chemin de page, puis le premier lien de profil trouvé dans la page. Ce dernier repli peut sélectionner une personne liée depuis une page de recherche ou un autre écran. Les conversations LinkedIn sont également prises en charge par le code commun.
- Risque : annoncer « un profil standard visible » sans préciser le garde-fou laisse fonctionner des surfaces exclues et peut associer le titre principal d'une page à l'URL d'une personne recommandée.
- Alternative : faire du profil personnel `/in/<identifiant>` la seule surface LinkedIn admissible pour cette livraison, avec identité issue de sa zone principale. Éviter une extension des heuristiques de conversation ou de recherche. Décider explicitement du traitement d'un widget de messagerie ouvert par-dessus un profil, car le code actuel privilégie la conversation.

### 3. Major : le changement de business est surtout une décision de parcours

- Dimension : Contrarian / YAGNI & Code Minimization.
- Constat : le panneau affiche déjà un bouton portant le nom du business qui ouvre la connexion. Le service worker conserve l'identifiant et le nom dans `chrome.storage.local`, demande un renouvellement pour ce business et rejette un renouvellement qui en changerait. La session serveur signe l'accountId et revérifie les droits actuels.
- Risque : construire un annuaire et un sélecteur propres à l'extension alors que le parcours web sait déjà sélectionner le business augmente inutilement les contrats d'authentification.
- Alternative : le parcours de reconnexion existant peut satisfaire « peut être changé » si son coût UX est accepté. Le concept n'exige pas explicitement un menu natif dans le panneau. Si un changement sans onglet est réellement requis, l'énoncer comme écart concret avant d'ajouter un endpoint.
- Point à prouver : le changement doit invalider immédiatement les résultats et recherches de l'ancien business. Le panneau conserve une résolution 30 secondes et ne compare les accountId qu'après une nouvelle résolution. Il faut tester changement de business avec panneau déjà ouvert, plusieurs onglets et requête en cours ; ce risque découle du code, son occurrence runtime reste à vérifier.

### 4. Major : réutiliser les rapprochements au lieu d'ajouter une déduplication LinkedIn

- Dimension : Contrarian / YAGNI & Code Minimization.
- Constat : `resolveCrmProfile` cherche déjà une URL canonique exacte pour le compte courant, dans les profils liés puis dans les leads historiques. Les autres signaux passent par des candidats ; le panneau connaît les états known/ambiguous et transmet une décision explicite de rattachement ou de création. Le classement de candidats existe dans `profile-matching.ts`.
- Risque : un rapprochement automatique par nom complet ou handle inter-réseaux peut fusionner des personnes différentes. « Reconnaître les leads existants » ne signifie pas garantir une identité universelle sur tous les réseaux.
- Alternative : garder l'URL canonique LinkedIn comme correspondance exacte, les rapprochements moins certains comme propositions explicites, et les résultats dans le business choisi. Vérifier les variantes www, barre finale et paramètres, les anciennes fiches, la répétition de capture et deux captures simultanées avant de considérer les doublons couverts. La revue n'a pas inspecté toutes les garanties transactionnelles de capture.

### 5. Major : ne pas transformer le nom visible en identité structurée certaine

- Dimension : Contrarian / YAGNI & Code Minimization.
- Constat : `minalySplitName` prend systématiquement le premier mot comme prénom et le reste comme nom ; cette règle est aussi appliquée après correction manuelle du nom complet. Les tests lus valident ce comportement, pas sa justesse pour tous les noms.
- Risque : l'exigence de nom complet visible est simple, mais une décomposition universelle ne l'est pas. Ajouter une IA, un dictionnaire ou une logique internationale serait disproportionné et resterait incertain.
- Alternative : conserver le nom complet visible comme information de référence et rendre explicite toute correction des champs structurés si le contrat CRM en a besoin. Vérifier les contraintes existantes avant de décider comment enregistrer les champs ; ne pas présumer qu'une migration est nécessaire.

## Vérifications d'acceptation prioritaires

1. Sur un profil personnel standard, un seul bouton apparaît près du bon nom après chargement et navigation interne ; panneau prérempli avec le nom visible et l'URL de cette personne. Une identité absente ou incertaine ne devient pas silencieusement un autre profil.
2. Aucun profil n'est capturé depuis recherche, Sales Navigator, entreprise ou conversation ; préciser le cas du widget de messagerie superposé.
3. Business sélectionné visible avant capture, conservé après fermeture, redémarrage et renouvellement de session ; retrait d'accès refusé côté serveur.
4. Passage A vers B avec panneau ouvert : aucun candidat, lien CRM, choix ou résultat tardif de A ne reste utilisable dans B. Répéter depuis deux onglets.
5. Profil déjà connu dans A reconnu dans A ; même profil dans B résolu indépendamment. Nom identique et candidat inter-réseaux exigent une décision. Double clic et nouvelle capture ne créent pas de doublon silencieux.
6. Mononyme, nom composé, plusieurs prénoms et nom contenant des titres conservent le sens du nom visible sans affirmer une décomposition certaine.
7. Régression ciblée Instagram sur capture, reconnaissance d'existant et choix du business puisque ces mécanismes sont partagés.

## Fichiers effectivement lus

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.1/agents/zoom_out.md`
- `docs/brainstorms/linkedin-extension/concept-input.md`
- `extension/README.md`
- `extension/manifest.json`
- `extension/src/content.ts` : recherches ciblées et extraits 90–350, 700–735, 1300–1440 ; pas lecture intégrale.
- `extension/src/background.ts` : recherches ciblées et extrait 80–135 ; pas lecture intégrale.
- `extension/profile-name-extraction.test.ts`
- `lib/crm/extension-http.ts`
- `lib/crm/extension-session.ts`
- `lib/crm/profile-matching.ts`
- `lib/crm/queries.ts` : recherches ciblées et extrait 772–850 ; pas lecture intégrale.
- `app/api/crm/extension/session/route.ts`

Inventaires consultés : `extension/`, `extension/src/`, fichiers de `app/api/crm/extension` et `lib/crm`. Aucun échec d'accès. Aucun secret lu, aucun test exécuté, aucun code produit modifié.
