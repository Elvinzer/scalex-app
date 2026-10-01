## Context

Voir `proposal.md` et `specs/crm-responsive-workspace/spec.md` pour le périmètre et le contrat utilisateur.

Le CRM a déjà plusieurs changements OpenSpec actifs. `improve-crm-mobile-setter-workflow` définit le comportement du setter mobile, des mutations, de la file d’actions et des fiches ; `improve-crm-call-reconciliation` porte les suggestions de rapprochement. Cette refonte traite leur présentation et leur accès, sans remplacer ces contrats.

État observé dans le code : `getCrmLeads` accepte déjà `limit` et `offset`, mais `/crm/leads` ne les transmet pas et n’expose pas le total correspondant aux filtres. Le Pipeline reçoit au plus 500 leads au total et les colonnes filtrent cette liste côté client. Appels est déjà paginé par 40, mais le formulaire d’association reçoit la liste Leads par défaut (100). `PillarTabs` peut repasser à la ligne ; `/crm/extension` n’est pas dans la navigation CRM. Les étapes canonisées sont les cinq valeurs `CRM_LEAD_STAGES` avec leurs libellés traduits. Les noms d’étapes de la maquette sont des données d’exemple incompatibles et ne doivent pas être repris.

## Goals / Non-Goals

**Goals:**

- Reproduire la hiérarchie et les interactions du handoff Claude Design dans les composants Minaly existants.
- Rendre la consultation des leads et de chaque étape du Pipeline complète, paginée et compréhensible.
- Garder les résultats Appels visibles sur mobile et permettre une association manuelle recherchable dans tous les leads accessibles du compte.
- Fournir la même architecture de pages sur mobile, tablette et desktop, avec les composants adaptés à chaque largeur.
- Préserver les contrats de données, les permissions et les parcours définis dans les changes CRM déjà actifs.

**Non-Goals:**

- Modifier les étapes métier, les résultats, les événements CRM, les KPI ou les règles d’attribution.
- Changer le comportement de rapprochement Falco, des intégrations d’appels, des imports ou des mutations métier.
- Introduire une nouvelle intégration, un modèle de données métier parallèle, une application native ou une dépendance runtime.
- Copier le HTML statique du prototype dans l’application.

## Decisions

### 1. Compter précisément le jeu de résultats filtré

La liste Leads affiche le nombre exact de leads correspondant aux filtres actifs et le nombre actuellement chargé, par exemple « 10 affichés sur 16 résultats ». Sans filtre, ce total représente la liste accessible au compte. Ne pas ajouter un total global séparé dans une recherche filtrée : il mélangerait la portée de la recherche et la taille de la base. Le total est calculé avec les mêmes contraintes d’accès et filtres que la liste. La pagination reste bornée ; l’écran n’a pas besoin de charger tous les leads.

Alternative écartée : afficher `100+` ou `500+`. Cela empêcherait l’utilisateur de savoir si ses filtres ont trouvé 16 leads ou si des résultats restent à charger.

### 2. Conserver la pagination serveur existante et l’étendre par étape

Pour Leads, réutiliser le contrat `limit`/`offset` présent dans `getCrmLeads`, ajouter le total filtré, puis transmettre les filtres et l’offset de façon cohérente jusqu’à la liste. Un chargement supplémentaire conserve le tri et les filtres courants ; une modification de filtre repart du premier lot.

Pour Pipeline, le chargement est indépendant pour chaque étape. Les compteurs portent sur tous les leads de l’étape et les cartes sont chargées par lots. Sur desktop, démarrer avec un petit nombre de cartes par colonne ; sur mobile, afficher la liste de l’étape sélectionnée et charger les suivantes progressivement. Ne pas dériver les compteurs des seuls leads déjà chargés.

Alternative écartée : augmenter simplement la limite globale à 1000. Cela masquerait encore des leads à terme et ne répartirait pas correctement le budget entre les étapes.

### 3. Chercher le lead d’un appel à la demande

Le sélecteur d’association manuelle utilise une requête serveur, scoped au compte et aux permissions, et ne charge qu’un petit nombre de candidats pertinents à chaque recherche. Le formulaire continue d’appeler la mutation manuelle existante. Les suggestions Falco restent un flux séparé et inchangé.

Alternative écartée : filtrer côté navigateur les 100 leads préchargés ou rendre toutes les options dans chaque ligne d’appel ; les deux approches excluent une partie des leads ou coûtent inutilement cher en DOM.

### 4. Passer en mode compact sous 1024 px

Sous 1024 px, utiliser la navigation CRM sur une seule ligne, des cartes pour Leads et Appels, et une seule étape de Pipeline visible à la fois. À partir de 1024 px, utiliser les tableaux adaptés et les cinq colonnes du Pipeline. Toute la page reste sans débordement horizontal ; seule la navigation CRM peut défiler horizontalement, avec une partie de l’onglet suivant visible pour signaler le débordement.

Les captures fournies ne constituent pas une preuve de validation des viewports indiqués : leurs fichiers sont des JPEG de 916 × 540 px malgré l’extension `.png`, et l’indicateur de largeur visible affiche `320 px` jusque dans les vues desktop. L’implémentation sera vérifiée aux largeurs réelles du contrat.

### 5. Garder le jour opérationnel au-dessus des analytics

Sur Aujourd’hui, la file d’actions précède les analytics mensuelles, repliées par défaut. La carte « prochaine action » est un raccourci vers le premier élément de la file et ne crée pas un doublon dans la liste. La suggestion d’extension peut rester sur la page après la file ; son accès permanent vient de la navigation CRM.

### 6. Respecter les règles de la DA du dépôt

Réutiliser `Button`, `.sticker-card`, les tokens CSS et les composants de formulaire existants. Le corail indique le CTA principal de l’écran. Le violet reste réservé aux fonctions IA ou analytics. Les liens manuels, les filtres, les boutons répétés « Terminer » et les autres actions de liste utilisent un style neutre ou outline. Les indicateurs de retard gardent leur libellé textuel et leur couleur sémantique. Les libellés d’étape viennent de `CRM_STAGE_LABEL_KEYS`, jamais des libellés d’exemple de la maquette.

### 7. Garder une expérience mobile accessible

Les contrôles interactifs ont une cible minimale de 44 px. Les feuilles modales réutilisent `Drawer` ou le composant dialog existant, gèrent le focus et restent utilisables avec le clavier virtuel. Le contenu réserve la zone du bouton Falco et des barres fixes. Les changements de wording sont synchronisés dans les locales FR/EN.

## Risks / Trade-offs

- **Comptage exact plus coûteux quand le volume croît** → appliquer exactement les filtres et le compte utilisateur ; mesurer la requête et ajouter un index seulement si nécessaire. Ne pas remplacer le total par un chiffre non vérifié.
- **Pagination et données qui changent pendant le parcours** → conserver un tri déterministe, réinitialiser le lot après changement de filtre et éviter de mélanger plusieurs périmètres de résultats dans le compteur.
- **Coexistence avec le change mobile actif** → réutiliser ses composants et états, comparer les modifications aux tâches déjà clôturées, et ne pas réimplémenter les mutations.
- **Libellés de démonstration trompeurs** → alimenter les composants avec les étapes et traductions réelles ; utiliser des données synthétiques clairement cohérentes dans les maquettes de validation.
- **La page Import est vide dans la capture mobile alors que le prototype source contient un contenu d’étape** → vérifier que le contenu du wizard est réellement visible dans l’application à chaque étape et à chaque largeur.

## Migration Plan

1. Vérifier les contrats CRM existants et les changements actifs avant de modifier chaque surface.
2. Ajouter les résultats comptés/paginés pour Leads, les requêtes par étape pour Pipeline et la recherche serveur du picker d’appel, en conservant l’isolation par compte.
3. Recomposer les surfaces UI en s’appuyant sur les composants et tokens existants ; synchroniser les locales FR/EN.
4. Vérifier le comportement visible aux largeurs 320, 360, 390, 768 et 1440 px, ainsi que les états filtres, résultats épuisés, absence de résultat et modales ouvertes.

Rollback : les changements de présentation et requêtes sont réversibles. Aucun backfill ni changement de source de vérité n’est prévu. Toute optimisation de schéma éventuelle doit être une migration Drizzle normale et ne doit pas être appliquée sans nécessité mesurée.
