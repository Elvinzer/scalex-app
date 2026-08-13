## Context

La page actuelle sépare l’overview Contenu et les vues détaillées Instagram/YouTube en routes distinctes. Les composants de détail existants portent déjà les règles d’affichage et de calcul propres à chaque plateforme ; l’ancien `contenu-view.tsx` supprimé par le commit `20fd3a6` fournit le modèle d’un panneau unique piloté par un sélecteur.

La refonte doit conserver les garde-fous de données ajoutés depuis : les publications Instagram doivent être filtrées par source et les vidéos YouTube privées ou non listées doivent rester absentes de toutes les métriques visibles. Aucun changement de schéma ou d’intégration n’est nécessaire.

## Goals / Non-Goals

**Goals:**

- Donner accès au changement de plateforme depuis une seule page et un seul sélecteur.
- Réutiliser les vues spécialisées actuelles plutôt que créer une table ou des KPI génériques.
- Restaurer la carte de connexion/synchronisation dans le panneau actif.
- Conserver la période partagée et les filtres propres à chaque plateforme pendant la visite.
- Rendre la plateforme active profonde-liable et compatible avec les anciennes URLs.
- Garantir une interaction accessible et responsive, vérifiée avec `agent-browser`.

**Non-Goals:**

- Ajouter TikTok, LinkedIn ou une autre intégration sociale.
- Modifier les métriques, les règles de calcul, les APIs OAuth ou le schéma de base de données.
- Repenser le design interne des cartes KPI, top 3, tableaux ou dialogues au-delà de leur composition dans le panneau.
- Remplacer les tableaux desktop par une nouvelle visualisation de données.

## Decisions

### Un shell de plateforme unique autour des vues existantes

Le shell Contenu sera responsable de la plateforme active, de la période partagée et de la composition de la carte de connexion puis de la vue spécialisée. Les vues Instagram et YouTube resteront responsables de leurs métriques, classements, filtres propres, tableaux et dialogues.

Cette séparation évite de dupliquer les règles de calcul dans un nouveau composant global et réduit le risque de perdre les différences de métriques entre les deux plateformes. L’alternative écartée est une table unifiée : elle simplifierait la composition mais supprimerait les colonnes et comportements propres à Instagram et YouTube.

### URL canonique avec query parameter

La plateforme active sera représentée par `?platform=instagram` ou `?platform=youtube` sur `/acquisition/contenu`. Le sélecteur mettra à jour cette valeur sans navigation documentaire complète afin que le changement reste immédiat. Une valeur absente utilisera la première plateforme connectée selon l’ordre stable Instagram puis YouTube ; si aucune n’est connectée, Instagram sera le panneau initial.

Les anciennes routes de détail resteront des points d’entrée compatibles et redirigeront vers l’URL canonique correspondante. L’alternative d’un retour aux liens entre pages est écartée car elle recrée la rupture de contexte constatée.

### État de filtre hoisté et spécialisé

La période sera portée par le shell afin qu’elle survive au changement de plateforme. Le format YouTube sera conservé dans l’état du shell ou dans un état persistant par plateforme afin que le retour sur YouTube restaure le dernier choix. Les composants de détail recevront leurs valeurs et callbacks de filtre contrôlés, sans modifier leurs règles de calcul.

Le changement de plateforme remplacera le panneau actif ; les tableaux non visibles ne seront pas rendus à l’écran, mais leur état de filtre sera conservé par le shell. La pagination pourra se réinitialiser lorsqu’un filtre change, comme aujourd’hui.

### Chargement serveur unique des données nécessaires

La page serveur chargera en parallèle les données de connexion et les insights nécessaires aux deux plateformes, puis transmettra au shell des données déjà filtrées par source et visibilité publique lorsque ces règles sont déterminables côté serveur. Le changement de plateforme ne déclenchera donc pas une nouvelle requête ni un écran de chargement complet.

Cette décision augmente le payload initial par rapport à l’overview actuelle, mais supprime les allers-retours lors du changement de plateforme. Les requêtes existantes restent la source de vérité et aucune dépendance externe n’est ajoutée.

### Carte de connexion dans le panneau actif

La carte complète Instagram ou YouTube sera rendue immédiatement sous le sélecteur, avant les filtres et métriques. Elle conservera les états et actions existants : prérequis et CTA pour une plateforme non connectée ; identité, synchronisation, rafraîchissement et déconnexion pour une plateforme connectée.

La gestion existe également dans `/integrations`, mais la duplication est volontaire pour respecter le parcours de contenu demandé : l’utilisateur doit pouvoir connecter ou comprendre l’état de la plateforme sans quitter cette page.

### Contrat d’interaction accessible

Le sélecteur utilisera un pattern de tabs ou de boutons sémantiques avec nom visible, état sélectionné annoncé, focus visible et statut textuel. Il conservera les tokens de la DA Minaly ; aucun code couleur propre aux plateformes ni hexadécimal supplémentaire ne sera introduit. Sur petit écran, le sélecteur pourra se répartir sur plusieurs lignes ou défiler localement, tandis que le défilement horizontal des tableaux restera limité à leur conteneur.

## Risks / Trade-offs

- **[Payload initial plus important]** → Charger les deux familles d’insights peut alourdir l’ouverture initiale ; mesurer le temps de rendu et conserver les requêtes en parallèle, avec états de chargement réservant l’espace nécessaire.
- **[Régression de filtrage]** → Le retour à l’ancien shell pourrait remélanger les sources ; tester explicitement les jeux Instagram et YouTube séparément et maintenir l’exclusion des vidéos privées/non listées.
- **[État incohérent après changement de filtre]** → Réinitialiser la pagination à chaque changement de période ou format et vérifier que les KPI, le top 3 et le tableau utilisent la même cohorte.
- **[Duplication de gestion de connexion]** → Garder `/integrations` comme emplacement de gestion global et vérifier que les deux cartes utilisent les mêmes actions server-side, sans créer une nouvelle logique OAuth.
- **[Débordement mobile des tableaux]** → Isoler `overflow-x-auto` au conteneur du tableau, vérifier les viewports 375/768/1440 et empêcher le débordement du shell entier.

## Migration Plan

1. Adapter le chargement de la page Contenu pour fournir aux deux vues leurs données nécessaires.
2. Introduire le shell et le sélecteur, puis intégrer les cartes de connexion et les vues spécialisées existantes.
3. Ajouter la lecture/écriture du paramètre `platform` et les redirections de compatibilité des anciennes routes.
4. Vérifier les états Instagram connecté, YouTube connecté, les deux connectés et aucune connexion avec `agent-browser`.
5. Vérifier clavier, audit d’accessibilité et responsive à 375, 768 et 1440 pixels.

Le rollback consiste à restaurer l’overview et les deux routes de détail actuelles ; aucune migration de base de données ni changement d’API n’est requis.
